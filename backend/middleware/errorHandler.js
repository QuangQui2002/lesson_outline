/**
 * Middleware xử lý lỗi tập trung cho toàn ứng dụng Express
 */
export function errorHandler(err, req, res, next) {
  console.error('Lỗi hệ thống:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Đã xảy ra lỗi hệ thống nghiêm trọng.';

  res.status(statusCode).json({
    success: false,
    message: message,
    // Chỉ hiển thị stack trace khi phát triển (nếu cần thiết)
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}
