import { performOcr, parseQuizOcr } from '../services/ocrService.js';
import fs from 'fs/promises';

/**
 * Xử lý tải ảnh lên, nhận diện chữ (OCR) và tự động bóc tách câu hỏi + đáp án
 */
export async function processOcr(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp một file hình ảnh để nhận diện.'
      });
    }

    const imagePath = req.file.path;
    console.log(`Đang chạy OCR cho file: ${imagePath}`);

    // 1. Thực hiện nhận diện OCR thô
    const extractedText = await performOcr(imagePath);

    // 2. Chạy thuật toán bóc tách câu hỏi & đáp án đúng thông minh
    const parsedData = parseQuizOcr(extractedText);

    // Xóa file tạm thời sau khi xử lý xong để giải phóng bộ nhớ
    try {
      await fs.unlink(imagePath);
      console.log(`Đã xóa file tạm thời: ${imagePath}`);
    } catch (unlinkErr) {
      console.error(`Không thể xóa file tạm thời ${imagePath}:`, unlinkErr);
    }

    res.json({
      success: true,
      message: 'Nhận diện và bóc tách dữ liệu thành công!',
      data: {
        text: extractedText,
        parsed: parsedData
      }
    });
  } catch (error) {
    // Nếu có lỗi, cũng cố gắng xóa file tạm
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkErr) {
        // bỏ qua lỗi xóa
      }
    }
    next(error);
  }
}
