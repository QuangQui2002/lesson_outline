import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import subjectRoutes from './routes/subjectRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import ocrRoutes from './routes/ocrRoutes.js';
import lessonVideoRoutes from './routes/lessonVideoRoutes.js';
import attemptAnswerRoutes from './routes/attemptAnswerRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { telegramApiNotifier } from './middleware/telegramApiNotifier.js';
import { getDbHealth, readDb } from './services/dbService.js';
import { getDailyApiStats, resetDailyApiStats } from './services/apiStatsService.js';
import { formatDailyApiReport, isTelegramConfigured, sendTelegramDocument, sendTelegramMessage } from './services/telegramService.js';

const app = express();
const PORT = process.env.PORT || 3000;
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://lesson-outline.onrender.com/api/ping';

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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '10mb' }));

app.use('/api', telegramApiNotifier);

app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/lesson-videos', lessonVideoRoutes);
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

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Lesson outline question bank API is running.'
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running at: http://localhost:${PORT}`);
});

cron.schedule('*/10 * * * *', async () => {
  try {
    const response = await fetch(KEEP_ALIVE_URL);
    console.log(`[keep-alive] ${new Date().toISOString()} ${response.status} ${KEEP_ALIVE_URL}`);
  } catch (error) {
    console.error('[keep-alive] Ping failed:', error.message);
  }
});
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


