/**
 * Rate limit đơn giản theo IP (fixed window, lưu trong bộ nhớ của instance).
 * Cần app.set('trust proxy', ...) đúng để req.ip là IP thật của client.
 */
export function rateLimit({ windowMs = 60000, max = 60, message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.' } = {}) {
  const multiplier = Number(process.env.RATE_LIMIT_MULTIPLIER || 1);
  const limit = Math.max(1, Math.round(max * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1)));
  const hits = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  cleanupTimer.unref();

  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
}
