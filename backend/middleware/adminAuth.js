import { createHash, timingSafeEqual } from 'node:crypto';

const hashKey = value => createHash('sha256').update(String(value)).digest();

export function isAdminKeyConfigured() {
  return Boolean(process.env.ADMIN_API_KEY);
}

/**
 * Bảo vệ thao tác thêm/sửa câu hỏi bằng header X-Admin-Key (xóa không cần key).
 * Local dev chưa cấu hình ADMIN_API_KEY thì cho qua; production chưa cấu hình thì chặn hẳn.
 */
export function requireAdminKey(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, message: 'Server chưa cấu hình ADMIN_API_KEY.' });
    }
    return next();
  }

  const providedKey = req.get('x-admin-key') || '';
  if (providedKey && timingSafeEqual(hashKey(providedKey), hashKey(configuredKey))) {
    return next();
  }

  return res.status(401).json({
    success: false,
    code: 'ADMIN_KEY_REQUIRED',
    message: 'Thao tác này cần admin key hợp lệ.'
  });
}
