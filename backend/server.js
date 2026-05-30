import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import subjectRoutes from './routes/subjectRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import ocrRoutes from './routes/ocrRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { telegramApiNotifier } from './middleware/telegramApiNotifier.js';
import { getDbHealth } from './services/dbService.js';
import { getDailyApiStats, resetDailyApiStats } from './services/apiStatsService.js';
import { formatDailyApiReport, isTelegramConfigured, sendTelegramMessage } from './services/telegramService.js';

const app = express();
const PORT = process.env.PORT || 3000;
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || 'https://lesson-outline.onrender.com/api/ping';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', telegramApiNotifier);

app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/ocr', ocrRoutes);

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
    await resetDailyApiStats();
  } catch (error) {
    console.error('[telegram-report] Failed to send daily report:', error.message);
  }
}, {
  timezone: 'Asia/Ho_Chi_Minh'
});

