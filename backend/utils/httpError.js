/**
 * Lỗi có mã HTTP và thông báo được phép trả về client (kể cả khi là 5xx ở production).
 */
export function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode, expose: true });
}

// Bỏ data URL (ảnh base64) để đo độ dài phần nội dung chữ/HTML thực sự.
export function measureTextLength(value = '') {
  return String(value || '').replace(/data:[a-z0-9.+\/-]+;base64,[a-z0-9+/=\s]+/gi, '').length;
}

export const MAX_QUESTION_TEXT_CHARS = Math.max(1000, Number(process.env.MAX_QUESTION_TEXT_CHARS || 50000));

export function exceedsQuestionTextLimit(...values) {
  return values.some(value => measureTextLength(value) > MAX_QUESTION_TEXT_CHARS);
}
