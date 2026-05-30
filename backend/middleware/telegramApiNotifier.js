import { recordApiRequest } from '../services/apiStatsService.js';
import { formatApiCallMessage, getClientIp, isTelegramConfigured, sendTelegramMessage } from '../services/telegramService.js';

const DEFAULT_IGNORED_PATHS = ['/api/ping', '/api/health/db'];

const getIgnoredPaths = () => {
  const configuredPaths = process.env.TELEGRAM_NOTIFY_IGNORE_PATHS;

  if (!configuredPaths) {
    return DEFAULT_IGNORED_PATHS;
  }

  return configuredPaths
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
};

export const telegramApiNotifier = (req, res, next) => {
  const ignoredPaths = getIgnoredPaths();
  if (ignoredPaths.some((path) => req.originalUrl.startsWith(path))) {
    return next();
  }

  const startedAt = Date.now();

  res.on('finish', () => {
    recordApiRequest({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      clientId: getClientIp(req)
    });

    if (!isTelegramConfigured()) {
      return;
    }

    const message = formatApiCallMessage({
      req,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });

    sendTelegramMessage(message).catch((error) => {
      console.error('[telegram-notifier] Failed to send message:', error.message);
    });
  });

  next();
};
