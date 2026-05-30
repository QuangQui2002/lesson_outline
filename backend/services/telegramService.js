const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

export const isTelegramConfigured = () => Boolean(
  process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
);

export const sendTelegramMessage = async (message) => {
  if (!isTelegramConfigured()) {
    return;
  }

  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${errorText}`);
  }
};

export const getStatusLabel = (statusCode) => {
  if (statusCode === 304) return 'Cached';
  if (statusCode >= 500) return 'Server error';
  if (statusCode >= 400) return 'Failed';
  if (statusCode >= 300) return 'Redirect';
  return 'Success';
};

export const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : (forwardedFor?.split(',')[0] || req.ip || req.socket?.remoteAddress || 'unknown');

  return ip.trim() === '::1' ? 'localhost' : ip.trim();
};

const getActionName = (req) => {
  const method = req.method;
  const path = req.path;

  if (path === '/questions' && method === 'GET') return 'View questions';
  if (path === '/questions' && method === 'POST') return 'Create question';
  if (path.startsWith('/questions/') && method === 'PUT') return 'Update question';
  if (path.startsWith('/questions/') && method === 'DELETE') return 'Delete question';
  if (path === '/questions/import/preview') return 'Preview import';
  if (path === '/questions/import') return 'Import questions';
  if (path === '/questions/stats') return 'View statistics';
  if (path === '/subjects' && method === 'GET') return 'View subjects';
  if (path === '/subjects' && method === 'POST') return 'Create subject';
  if (path.startsWith('/subjects/') && method === 'DELETE') return 'Delete subject';
  if (path === '/ocr') return 'Scan image OCR';

  return `${method} request`;
};

const pickSafeData = (req) => {
  const queryData = Object.entries(req.query || {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${value}`);

  const bodyKeys = ['subjectId', 'questionId', 'id', 'title', 'name'];
  const bodyData = bodyKeys
    .filter((key) => req.body?.[key])
    .map((key) => `${key}=${req.body[key]}`);

  const data = [...queryData, ...bodyData].slice(0, 4);
  return data.length ? data.join(', ') : 'None';
};

const getDevice = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const browser = userAgent.includes('Edg/') ? 'Edge'
    : userAgent.includes('Chrome/') ? 'Chrome'
    : userAgent.includes('Firefox/') ? 'Firefox'
    : userAgent.includes('Safari/') ? 'Safari'
    : 'Unknown browser';
  const os = userAgent.includes('Windows') ? 'Windows'
    : userAgent.includes('Mac OS') ? 'macOS'
    : userAgent.includes('Android') ? 'Android'
    : userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'iOS'
    : 'Unknown OS';

  return `${browser} / ${os}`;
};

const getSource = (req) => {
  const origin = req.headers.origin || req.headers.referer || 'unknown';
  return origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
};

export const formatApiCallMessage = ({ req, statusCode, durationMs }) => {
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  return [
    '<b>New API request</b>',
    '',
    `<b>Action:</b> ${escapeHtml(getActionName(req))}`,
    `<b>Endpoint:</b> <code>${escapeHtml(req.method)} ${escapeHtml(req.originalUrl)}</code>`,
    `<b>Data:</b> ${escapeHtml(pickSafeData(req))}`,
    `<b>Status:</b> ${escapeHtml(statusCode)} (${escapeHtml(getStatusLabel(statusCode))})`,
    `<b>Speed:</b> ${escapeHtml(durationMs)}ms`,
    `<b>From:</b> ${escapeHtml(getSource(req))}`,
    `<b>Device:</b> ${escapeHtml(getDevice(req))}`,
    `<b>Time:</b> ${escapeHtml(time)}`
  ].join('\n');
};

export const formatDailyApiReport = (stats) => {
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const endpointLines = stats.endpoints.length
    ? stats.endpoints.map((item) => `- ${item.name}: ${item.count}`).join('\n')
    : '- No requests';
  const statusLines = stats.statuses.length
    ? stats.statuses.map((item) => `${item.name}: ${item.count}`).join(', ')
    : 'None';

  return [
    '<b>Daily API report</b>',
    '',
    `<b>Total calls:</b> ${escapeHtml(stats.totalRequests)}`,
    `<b>Unique users:</b> ${escapeHtml(stats.uniqueUsers)}`,
    `<b>Status:</b> ${escapeHtml(statusLines)}`,
    '',
    '<b>Top endpoints:</b>',
    `<code>${escapeHtml(endpointLines)}</code>`,
    '',
    `<b>Report time:</b> ${escapeHtml(time)}`
  ].join('\n');
};
