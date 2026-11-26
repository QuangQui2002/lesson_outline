import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import subjectRoutes from './routes/subjectRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import ocrRoutes from './routes/ocrRoutes.js';
import attemptAnswerRoutes from './routes/attemptAnswerRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { telegramApiNotifier } from './middleware/telegramApiNotifier.js';
import { getDbHealth, readDb } from './services/dbService.js';
import { flushApiStats, getDailyApiStats, resetDailyApiStats } from './services/apiStatsService.js';
import { formatDailyApiReport, isTelegramConfigured, sendTelegramDocument, sendTelegramMessage } from './services/telegramService.js';
import { isAdminKeyConfigured } from './middleware/adminAuth.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
const hasFrontendBuild = fsExists(frontendDistPath);
const PORT = process.env.PORT || 3000;
// Render tự set RENDER_EXTERNAL_URL; chạy local thì không ping để khỏi gọi lên production
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL
  || (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '') + '/api/ping' : '');
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function parseTrustProxy(value) {
  if (value === undefined || value === '') return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function apiTimingMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const slowMs = Number(process.env.SLOW_API_LOG_MS || 2000);
  const originalWriteHead = res.writeHead;

  res.writeHead = function writeHeadWithTiming(...args) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    res.setHeader('X-Response-Time-Ms', durationMs.toFixed(1));
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const label = '[api-time] ' + req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + durationMs.toFixed(1) + 'ms';
    if (durationMs >= slowMs || res.statusCode >= 500) {
      console.warn(label);
    } else if (process.env.API_TIMING_LOG === 'true') {
      console.log(label);
    }
  });

  next();
}

function fsExists(targetPath) {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch (error) {
    return false;
  }
}

function buildImportableBackup(db) {
  const subjects = Array.isArray(db.subjects) ? db.subjects : [];
  const questions = Array.isArray(db.questions) ? db.questions : [];
  const questionsBySubject = questions.reduce((groups, question) => {
    if (!groups[question.subjectId]) groups[question.subjectId] = [];
    groups[question.subjectId].push({
      questiontext: question.content || '',
      generalfeedback: question.answer || '',
      quizName: question.quizName || 'Khac',
      tags: Array.isArray(question.tags) ? question.tags : [],
      sourceId: question.sourceId || question.id || null,
      sourceSlot: question.sourceSlot || null
    });
    return groups;
  }, {});

  return {
    exportedAt: new Date().toISOString(),
    format: 'lesson-outline-telegram-backup-v1',
    note: 'To import back: choose a subject in the app, then import questions from the matching subject.questions array.',
    totalSubjects: subjects.length,
    totalQuestions: questions.length,
    subjects: subjects.map(subject => ({
      id: subject.id,
      name: subject.name,
      createdAt: subject.createdAt || null,
      questionCount: questionsBySubject[subject.id]?.length || 0,
      questions: questionsBySubject[subject.id] || []
    })),
    questions: questions.map(question => ({
      subjectId: question.subjectId,
      subjectName: subjects.find(subject => subject.id === question.subjectId)?.name || '',
      questiontext: question.content || '',
      generalfeedback: question.answer || '',
      quizName: question.quizName || 'Khac',
      tags: Array.isArray(question.tags) ? question.tags : [],
      sourceId: question.sourceId || question.id || null,
      sourceSlot: question.sourceSlot || null
    }))
  };
}

function getBackupFilename() {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return `lesson-outline-backup-${date}.json`;
}

// Render đứng sau proxy: cần trust proxy để req.ip là IP thật (dùng cho rate limit, thống kê)
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.disable('x-powered-by');

app.use(cors({
  // Để trống CORS_ORIGINS thì cho phép mọi origin (frontend deploy riêng, local dev)
  origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Admin-Key']
}));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '10mb' }));

app.use('/api', apiTimingMiddleware);
app.use('/api', telegramApiNotifier);

app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/attempt-answers', attemptAnswerRoutes);

app.get('/api/ping', (req, res) => {
  res.type('text/plain').send('xin c\u1ea3m \u01a1n');
});

app.get('/api/health/db', async (req, res, next) => {
  try {
    const health = await getDbHealth();
    res.status(health.connected ? 200 : 503).json({
      success: health.connected,
      data: health
    });
  } catch (error) {
    next(error);
  }
});

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Lesson outline question bank API is running. Frontend build not found.'
    });
  });
}

// Đường dẫn /api không tồn tại: trả JSON thay vì trang HTML mặc định của Express
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `Không tìm thấy API ${req.method} ${req.originalUrl}` });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Server is running at: http://localhost:${PORT}`);
  if (!isAdminKeyConfigured()) {
    console.warn(process.env.NODE_ENV === 'production'
      ? '[security] ADMIN_API_KEY chua duoc cau hinh: cac thao tac them/sua cau hoi se bi chan.'
      : '[security] ADMIN_API_KEY chua duoc cau hinh: cac thao tac them/sua cau hoi dang mo (chi nen dung khi dev local).');
  }
});

// Render gửi SIGTERM khi deploy/restart. Ngừng nhận request mới nhưng chờ các request đang chạy
// (giải đáp án bằng AI có thể mất tới ~150s) xong rồi mới tắt; nếu tắt ngay, client nhận trang lỗi HTML 502.
const SHUTDOWN_GRACE_MS = Math.max(1000, Number(process.env.SHUTDOWN_GRACE_MS || 170000));
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] Nhan ${signal}, cho request dang chay xong (toi da ${Math.round(SHUTDOWN_GRACE_MS / 1000)}s)...`);
  const forceExitTimer = setTimeout(() => {
    console.warn('[shutdown] Het thoi gian cho, buoc dung server.');
    process.exit(0);
  }, SHUTDOWN_GRACE_MS);
  forceExitTimer.unref();
  await new Promise(resolve => server.close(resolve));
  try {
    await flushApiStats();
  } catch (error) {
    console.error('[shutdown] Flush api stats failed:', error.message);
  }
  console.log('[shutdown] Da dung server.');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (KEEP_ALIVE_URL) {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const response = await fetch(KEEP_ALIVE_URL);
      console.log(`[keep-alive] ${new Date().toISOString()} ${response.status} ${KEEP_ALIVE_URL}`);
    } catch (error) {
      console.error('[keep-alive] Ping failed:', error.message);
    }
  });
}
cron.schedule(process.env.TELEGRAM_DAILY_REPORT_CRON || '59 23 * * *', async () => {
  if (!isTelegramConfigured()) {
    await resetDailyApiStats();
    return;
  }

  try {
    const stats = await getDailyApiStats();
    await sendTelegramMessage(formatDailyApiReport(stats));

    const db = await readDb();
    const backup = buildImportableBackup(db);
    const backupBuffer = Buffer.from(JSON.stringify(backup, null, 2), 'utf8');
    await sendTelegramDocument({
      buffer: backupBuffer,
      filename: getBackupFilename(),
      caption: `<b>Daily backup</b>\nSubjects: ${backup.totalSubjects}\nQuestions: ${backup.totalQuestions}`
    });

    await resetDailyApiStats();
  } catch (error) {
    console.error('[telegram-report] Failed to send daily report:', error.message);
  }
}, {
  timezone: 'Asia/Ho_Chi_Minh'
});

