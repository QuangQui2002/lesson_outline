import { createWorker } from 'tesseract.js';

/**
 * Trích xuất văn bản từ hình ảnh bằng Tesseract.js
 * @param {string} imagePath - Đường dẫn tuyệt đối tới file ảnh trên máy chủ
 * @returns {Promise<string>} - Nội dung văn bản được nhận diện
 */
export async function performOcr(imagePath) {
  let worker;
  try {
    // Khởi tạo worker hỗ trợ nhận diện tiếng Việt và tiếng Anh
    worker = await createWorker('vie+eng');
    
    // Thực hiện nhận diện
    const { data: { text } } = await worker.recognize(imagePath);
    
    return text;
  } catch (error) {
    console.error('Lỗi trong ocrService:', error);
    throw new Error('Không thể xử lý ảnh hoặc nhận diện văn bản: ' + error.message);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

/**
 * Phân tích cú pháp văn bản OCR thông minh để bóc tách câu hỏi trắc nghiệm
 * và trích xuất đáp án ĐÚNG từ khối "Phản hồi đáp án"
 * @param {string} rawText - Nội dung thô thu được từ OCR
 * @returns {{content: string, answer: string, tags: string[]}}
 */
export function parseQuizOcr(rawText) {
  if (!rawText) return { content: '', answer: '', tags: ['ocr'] };

  // 1. Tách dòng và chuẩn hóa khoảng trắng
  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const cleanRawText = lines.join('\n');

  let content = '';
  let answer = '';
  let tags = ['ocr', 'tự động'];

  // Các từ khóa chỉ báo kết thúc phần câu hỏi & lựa chọn
  const endMarkers = [
    /phản\s+hồi\s+đáp\s+án/i,
    /phản\s+hồi\s+dáp\s+án/i,
    /phan\s+hoi\s+dap\s+an/i,
    /đáp\s+án\s+đúng\s+là/i,
    /dap\s+an\s+dung\s+la/i,
    /đáp\s+án\s+chính\s+xác/i,
    /dap\s+an\s+chinh\s+xac/i,
    /đáp\s+án\s+chưa\s+chính\s+xác/i,
    /dap\s+an\s+chua\s+chinh\s+xac/i
  ];

  let cutIndex = -1;
  for (const regex of endMarkers) {
    const match = cleanRawText.match(regex);
    if (match && match.index !== undefined) {
      if (cutIndex === -1 || match.index < cutIndex) {
        cutIndex = match.index;
      }
    }
  }

  // 2. Trích xuất Phần Câu Hỏi & Các Lựa Chọn A, B, C, D
  let questionPart = cutIndex !== -1 ? cleanRawText.substring(0, cutIndex).trim() : cleanRawText;

  // Loại bỏ các chữ rác như điểm số ("1/1 điểm", "0/1 điểm", v.v.)
  questionPart = questionPart.replace(/\d+\/\d+\s*(điểm|diem|diêm)/gi, '');
  
  // Loại bỏ các dòng chữ "Báo lỗi câu hỏi" nếu bị dính vào
  questionPart = questionPart.replace(/Báo\s+lỗi\s+câu\s+hỏi/gi, '');
  questionPart = questionPart.replace(/Bao\s+loi\s+cau\s+hoi/gi, '');

  content = questionPart.trim();

  // 3. Trích xuất Phần Đáp Án Đúng & Giải thích từ khối Phản Hồi Đáp Án
  const feedbackIndex = cleanRawText.search(/phản\s+hồi\s+đáp\s+án/i) !== -1 
    ? cleanRawText.search(/phản\s+hồi\s+đáp\s+án/i) 
    : cleanRawText.search(/phan\s+hoi\s+dap\s+an/i);
    
  let feedbackPart = '';
  if (feedbackIndex !== -1) {
    feedbackPart = cleanRawText.substring(feedbackIndex);
  } else {
    const correctIndex = cleanRawText.search(/đáp\s+án\s+đúng\s+là/i) !== -1
      ? cleanRawText.search(/đáp\s+án\s+đúng\s+là/i)
      : cleanRawText.search(/dap\s+an\s+dung\s+la/i);
    if (correctIndex !== -1) {
      feedbackPart = cleanRawText.substring(correctIndex);
    }
  }

  if (feedbackPart) {
    // Trích xuất dòng: Đáp án đúng là
    const ansMatch = feedbackPart.match(/(?:đáp\s+án\s+đúng\s+là|dap\s+an\s+dung\s+la)\s*:\s*([^\n]+)/i);
    const correctAnswerText = ansMatch ? ansMatch[1].trim() : '';

    // Trích xuất dòng: Vì: (lấy đến chữ Tham khảo hoặc Báo lỗi tiếp theo)
    const viMatch = feedbackPart.match(/(?:vì|vi|vỉ)\s*:\s*([\s\S]*?)(?=(?:tham\s+khảo|tham\s+khao|báo\s+lỗi|bao\s+loi|$))/i);
    const explanationText = viMatch ? viMatch[1].trim() : '';

    // Trích xuất dòng: Tham khảo:
    const tkMatch = feedbackPart.match(/(?:tham\s+khảo|tham\s+khao)\s*:\s*([\s\S]*?)(?=(?:báo\s+lỗi|bao\s+loi|$))/i);
    const referenceText = tkMatch ? tkMatch[1].trim() : '';

    let parsedAnswer = '';
    if (correctAnswerText) {
      parsedAnswer += `👉 ${correctAnswerText}`;
    } else {
      parsedAnswer += 'Không tìm thấy mô tả đáp án đúng cụ thể.';
    }

    if (explanationText) {
      parsedAnswer += `\n\n💡 Giải thích:\n${explanationText}`;
    }
    if (referenceText) {
      parsedAnswer += `\n\n📖 Tham khảo: ${referenceText}`;
    }

    answer = parsedAnswer;
  } else {
    // Dự phòng khi không tìm thấy khối Phản Hồi Đáp Án
    const fallbackMatch = cleanRawText.match(/(?:đáp\s+án\s+đúng\s+là|dap\s+an\s+dung\s+la)\s*:\s*([^\n]+)/i);
    if (fallbackMatch) {
      answer = `👉 ${fallbackMatch[1].trim()}`;
    } else {
      answer = 'Vui lòng điền đáp án thủ công dựa vào ảnh gốc.';
    }
  }

  return {
    content,
    answer,
    tags
  };
}
