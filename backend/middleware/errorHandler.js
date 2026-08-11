/**
 * Middleware xử lý lỗi tập trung cho toàn ứng dụng Express
 */
export function errorHandler(err, req, res, next) {
  console.error('Lỗi hệ thống:', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.type === 'entity.too.large'
    ? 'Dữ liệu import quá lớn. Hãy giảm số lượng hoặc dung lượng ảnh.'
    : err.message || 'Đã xảy ra lỗi hệ thống nghiêm trọng.';

  res.status(statusCode).json({
    success: false,
    message: message,
    // Chỉ hiển thị stack trace khi phát triển (nếu cần thiết)
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}
