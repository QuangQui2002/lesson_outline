/**
 * Middleware xử lý lỗi tập trung cho toàn ứng dụng Express
 */
export function errorHandler(err, req, res, next) {
  console.error('Lỗi hệ thống:', err);

  const statusCode = err.name === 'MulterError'
    ? 400
    : err.statusCode || err.status || 500;
  // Ở production không trả chi tiết lỗi 5xx (vd. lỗi Supabase) về client, trừ lỗi đã đánh dấu expose
  const hideDetails = statusCode >= 500 && !err.expose && process.env.NODE_ENV === 'production';

  let message;
  if (err.type === 'entity.too.large') {
    message = 'Dữ liệu import quá lớn. Hãy giảm số lượng hoặc dung lượng ảnh.';
  } else if (hideDetails) {
    message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
  } else {
    message = err.message || 'Đã xảy ra lỗi hệ thống nghiêm trọng.';
  }

  res.status(statusCode).json({
    success: false,
    message: message,
    // Chỉ hiển thị stack trace khi phát triển (nếu cần thiết)
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}
