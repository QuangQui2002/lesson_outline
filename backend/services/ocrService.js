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

function normalizeText(text = '') {
  return text
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•●]/g, '-')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function foldVietnamese(text = '') {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function stripPeripheralText(text) {
  const lines = text.split('\n');
  const foldedLines = lines.map(line => foldVietnamese(line));
  const questionStartIndex = foldedLines.findIndex(line =>
    /\bcau\s*\d+\b/.test(line)
    || /\bquestion\s*\d*\b/.test(line)
    || /^[a-h]\s*[\.\)\:\-]/i.test(line)
  );

  const focusedLines = questionStartIndex > 0 ? lines.slice(questionStartIndex) : lines;
  return focusedLines
    .filter(line => {
      const folded = foldVietnamese(line);
      return !/^\d{1,2}:\d{2}\b/.test(folded)
        && !/\b(kb\/s|5g|wifi|facebook|thuong mai dien tu|xem danh sach cau hoi)\b/.test(folded)
        && !/^\s*[×x]\s*$/.test(folded);
    })
    .join('\n')
    .trim();
}

function removeInlineStatus(text) {
  return text
    .replace(/(?:^|\n)\s*(?:[✓✔☑✅]\s*)?(?:đáp\s*án\s*chính\s*xác|dap\s*an\s*chinh\s*xac)\s*(?=\n|$)/gi, '\n')
    .replace(/(?:^|\n)\s*(?:[✕✖❌]\s*)?(?:đáp\s*án\s*chưa\s*chính\s*xác|dap\s*an\s*chua\s*chinh\s*xac)\s*(?=\n|$)/gi, '\n');
}

function removeNoise(text) {
  return removeInlineStatus(text)
    .replace(/\b\d+\s*\/\s*\d+\s*(điểm|diem|point|points)\b/gi, '')
    .replace(/\b(báo|bao)\s+lỗi\s+câu\s+hỏi\b/gi, '')
    .replace(/\b(report|flag)\s+(this\s+)?question\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findFirstIndex(text, patterns) {
  let firstIndex = -1;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined && (firstIndex === -1 || match.index < firstIndex)) {
      firstIndex = match.index;
    }
  }
  return firstIndex;
}

function extractOptions(text) {
  const options = {};
  const optionRegex = /(?:^|\n)\s*([A-H])\s*[\.\)\:\-]\s*([^\n]+(?:\n(?!\s*[A-H]\s*[\.\)\:\-]|\s*(?:đáp\s*án|dap\s*an|answer|correct|phản\s*hồi|phan\s*hoi)\b)[^\n]+)*)/gi;
  let match;

  while ((match = optionRegex.exec(text)) !== null) {
    const key = match[1].toUpperCase();
    const value = removeInlineStatus(match[2])
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (value) options[key] = value;
  }

  return options;
}

function extractSelectedAnswer(text, options) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const statusIndex = lines.findIndex(line => /(?:đáp\s*án\s*chính\s*xác|dap\s*an\s*chinh\s*xac)/i.test(line));
  if (statusIndex === -1) return '';

  for (let index = statusIndex - 1; index >= 0; index--) {
    const match = lines[index].match(/^([A-H])\s*[\.\)\:\-]\s*(.+)$/i);
    if (!match) continue;

    const letter = match[1].toUpperCase();
    const optionText = removeInlineStatus(match[2]).trim() || options[letter] || '';
    return optionText ? `${letter}. ${optionText}` : letter;
  }

  return '';
}

function extractAnswerFromMarkers(text, options) {
  const letterMarkerPatterns = [
    /(?:đáp[ \t]*án[ \t]*(?:đúng|chính[ \t]*xác)?|dap[ \t]*an[ \t]*(?:dung|chinh[ \t]*xac)?|answer|correct[ \t]*answer|key)[ \t]*(?:là|la|is)?[ \t]*[:\-][ \t]*([A-H])(?=[ \t]*(?:$|\n|[\.\)\:\-]))(?:[ \t]*[\.\)\:\-][ \t]*([^\n]+))?/i,
    /(?:chọn|chon|choose|select)[ \t]+(?:đáp[ \t]*án|dap[ \t]*an|answer)?[ \t]*([A-H])\b/i,
    /(?:phương\s*án|phuong\s*an|option)\s+([A-H])\s+(?:đúng|dung|correct)\b/i
  ];

  for (const pattern of letterMarkerPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const letter = match[1]?.toUpperCase();
    const inlineText = match[2]?.trim();
    const optionText = letter && options[letter] ? options[letter] : inlineText;

    if (letter && optionText) return `${letter}. ${optionText}`;
    if (letter) return letter;
  }

  const tickedLine = text
    .split('\n')
    .map(line => line.trim())
    .find(line => /[✓✔☑✅]|\(x\)|\[x\]|\*/i.test(line) && /^([A-H])\s*[\.\)\:\-]/i.test(line));
  if (tickedLine) {
    const lineMatch = tickedLine.match(/^([A-H])\s*[\.\)\:\-]\s*(.+)$/i);
    const letter = lineMatch[1].toUpperCase();
    const optionText = lineMatch[2].replace(/[✓✔☑✅*]|\(x\)|\[x\]/gi, '').trim() || options[letter] || '';
    return optionText ? `${letter}. ${optionText}` : letter;
  }

  const tickMatch = text.match(/(?:^|\n)\s*(?:[✓✔☑✅*]|\(x\)|\[x\]|x\.)\s*([A-H])\s*[\.\)\:\-]\s*([^\n]+)/i);
  if (tickMatch) {
    const letter = tickMatch[1].toUpperCase();
    const optionText = (tickMatch[2] || options[letter] || '').trim();
    return optionText ? `${letter}. ${optionText}` : letter;
  }

  return '';
}

function extractCorrectAnswerText(text) {
  const match = text.match(/(?:đáp\s*án\s*đúng\s*là|dap\s*an\s*dung\s*la|correct\s*answer\s*(?:is)?|answer\s*(?:is)?)\s*[:\-]\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function extractExplanation(text) {
  const explanationMatch = text.match(/(?:vì|vi|giải\s*thích|giai\s*thich|explanation|because)\s*:\s*([\s\S]*?)(?=(?:tham\s+khảo|tham\s+khao|reference|báo\s+lỗi|bao\s+loi|$))/i);
  return explanationMatch ? explanationMatch[1].trim() : '';
}

function extractReference(text) {
  const referenceMatch = text.match(/(?:tham\s+khảo|tham\s+khao|reference)\s*:\s*([\s\S]*?)(?=(?:báo\s+lỗi|bao\s+loi|$))/i);
  return referenceMatch ? referenceMatch[1].trim() : '';
}

/**
 * Phân tích cú pháp văn bản OCR để bóc tách câu hỏi, lựa chọn và đáp án.
 * Ưu tiên vùng bắt đầu từ "Câu..." để bỏ header/footer ngoài rìa màn hình.
 * Nếu ảnh có "Đáp án chính xác" thì lấy lựa chọn đang được check.
 * Nếu ảnh có "Đáp án chưa chính xác" thì lấy dòng "Đáp án đúng là" trong phần phản hồi.
 * @param {string} rawText - Nội dung thô thu được từ OCR
 * @returns {{content: string, answer: string, tags: string[]}}
 */
export function parseQuizOcr(rawText) {
  if (!rawText) return { content: '', answer: '', tags: ['ocr'] };

  const cleanRawText = stripPeripheralText(normalizeText(rawText));
  const tags = ['ocr', 'tự động'];
  const endMarkers = [
    /(?:^|\n)\s*phản\s+hồi\s+đáp\s+án\b/i,
    /(?:^|\n)\s*phan\s+hoi\s+dap\s+an\b/i,
    /(?:^|\n)\s*đáp\s*án\s*đúng\s*là\s*[:\-]/i,
    /(?:^|\n)\s*dap\s*an\s*dung\s*la\s*[:\-]/i,
    /(?:^|\n)\s*(?:answer|correct\s*answer|key)\s*[:\-]/i
  ];

  const cutIndex = findFirstIndex(cleanRawText, endMarkers);
  const questionPart = removeNoise(cutIndex !== -1 ? cleanRawText.slice(0, cutIndex) : cleanRawText);
  const feedbackPart = cutIndex !== -1 ? cleanRawText.slice(cutIndex) : cleanRawText;
  const options = extractOptions(questionPart);
  const isIncorrectNotice = /(?:đáp\s*án\s*chưa\s*chính\s*xác|dap\s*an\s*chua\s*chinh\s*xac)/i.test(cleanRawText);

  let content = questionPart;
  const foldedContent = foldVietnamese(content);
  const questionStartMatch = foldedContent.match(/(?:^|\n)\s*(?:cau\s*\d+|question\s*\d*|bai\s*\d+)\s*[\.\:\-\)]?/);
  if (questionStartMatch && questionStartMatch.index !== undefined) {
    content = content.slice(questionStartMatch.index).trim();
  }

  let answer = '';
  const correctAnswerText = extractCorrectAnswerText(feedbackPart);
  if (isIncorrectNotice && correctAnswerText) {
    answer = correctAnswerText;
  } else {
    answer = extractAnswerFromMarkers(feedbackPart, options)
      || extractSelectedAnswer(cleanRawText, options)
      || correctAnswerText;
  }

  const explanation = extractExplanation(feedbackPart);
  const reference = extractReference(feedbackPart);

  if (answer && explanation) {
    answer = `👉 ${answer}\n\n💡 Giải thích:\n${explanation}`;
  } else if (answer) {
    answer = `👉 ${answer}`;
  }

  if (answer && reference) {
    answer += `\n\n📖 Tham khảo: ${reference}`;
  }

  return {
    content: content.trim(),
    answer: answer.trim(),
    tags
  };
}