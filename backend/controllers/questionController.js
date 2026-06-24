import { appendQuestions, readDb, writeDb } from '../services/dbService.js';
function stripHtml(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


const DUPLICATE_SIMILARITY_THRESHOLD = 0.8;
const DEFAULT_QUIZ_NAME = 'Khac';

function normalizeQuizName(quizName = '') {
  const normalized = stripHtml(quizName).trim();
  return normalized || DEFAULT_QUIZ_NAME;
}

function normalizeQuestionForCompare(content = '') {
  return String(content)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^\s*cau\s*\d+\s*[:\.\-\)]?/i, '')
    .replace(/\b\d+\s*\/\s*\d+\s*(diem|point|points)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  const currentRow = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const insertCost = currentRow[j - 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const replaceCost = previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      currentRow[j] = Math.min(insertCost, deleteCost, replaceCost);
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }

  return previousRow[b.length];
}

function calculateQuestionSimilarity(contentA, contentB) {
  const normalizedA = normalizeQuestionForCompare(contentA);
  const normalizedB = normalizeQuestionForCompare(contentB);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  const distance = levenshteinDistance(normalizedA, normalizedB);
  return 1 - distance / maxLength;
}

function findSimilarQuestion(content, questions, excludeId = null) {
  let bestMatch = null;

  for (const question of questions) {
    if (excludeId && question.id === excludeId) continue;
    const similarity = calculateQuestionSimilarity(content, question.content || '');
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        id: question.id,
        content: question.content,
        similarity
      };
    }
  }

  return bestMatch;
}
function getQuestionArray(importPayload, subjectId = '', subjectName = '') {
  if (Array.isArray(importPayload)) return importPayload;
  if (Array.isArray(importPayload?.subjects)) {
    const matchedSubject = importPayload.subjects.find(subject =>
      subject.id === subjectId ||
      (subjectName && String(subject.name || '').trim().toLowerCase() === subjectName.trim().toLowerCase())
    );
    if (Array.isArray(matchedSubject?.questions)) return matchedSubject.questions;
  }
  if (Array.isArray(importPayload?.questions)) return importPayload.questions;
  if (Array.isArray(importPayload?.data?.questions)) return importPayload.data.questions;
  return [];
}

function stripQuestionNumberPrefix(content = '') {
  return String(content)
    .replace(/^\s*c(?:a|\u00e2)u\s*\d+\s*[:.\-)\u2013\u2014]?\s*/i, '')
    .replace(/^\s*\d+\s*\/\s*\d+\s*(?:\u0111i\u1ec3m|diem|point|points)\s*/i, '')
    .trim();
}

function normalizeImportedQuestion(sourceQuestion, quizName = DEFAULT_QUIZ_NAME) {
  const questionText = stripQuestionNumberPrefix(stripHtml(sourceQuestion.questiontext || sourceQuestion.questionText || sourceQuestion.content || ''));
  const answers = Array.isArray(sourceQuestion.answertext) ? sourceQuestion.answertext : [];
  const optionLines = answers
    .map((answer, answerIndex) => {
      const letter = String.fromCharCode(65 + answerIndex);
      return `${letter}. ${stripHtml(answer.answer || answer.text || '')}`.trim();
    })
    .filter(line => line.replace(/^[A-Z]\.\s*/, '').trim() !== '');

  const contentParts = [];
  contentParts.push(questionText);
  if (optionLines.length > 0) contentParts.push(optionLines.join('\n'));

  const correctAnswers = answers
    .filter(answer => answer.iscorrect === true || Number(answer.fraction) > 0)
    .map(answer => stripHtml(answer.answer || answer.text || ''))
    .filter(Boolean);

  const generalFeedback = stripHtml(sourceQuestion.generalfeedback || sourceQuestion.generalFeedback || sourceQuestion.answer || '');
  const rightAnswer = stripHtml(sourceQuestion.rightanswer || sourceQuestion.rightAnswer || '');
  const answerParts = [];

  if (generalFeedback) {
    answerParts.push(generalFeedback);
  } else if (rightAnswer) {
    answerParts.push(`Đáp án đúng là: ${rightAnswer}`);
  } else if (correctAnswers.length > 0) {
    answerParts.push(`Đáp án đúng là: ${correctAnswers.join('; ')}`);
  }

  return {
    content: contentParts.filter(Boolean).join('\n').trim(),
    answer: answerParts.join('\n\n').trim(),
    quizName: normalizeQuizName(sourceQuestion.quizName || sourceQuestion.quiz?.name || quizName),
    tags: ['json', 'import', sourceQuestion.type || 'question'].filter(Boolean)
  };
}

function buildImportAnalysis(sourceQuestions, existingQuestions, subjectId, quizName = DEFAULT_QUIZ_NAME, now = Date.now()) {
  const importableQuestions = [];
  const skipped = [];

  sourceQuestions.forEach((sourceQuestion, index) => {
    const normalized = normalizeImportedQuestion(sourceQuestion, quizName);
    if (!normalized.content || !normalized.answer) {
      skipped.push({ index, slot: sourceQuestion.slot, reason: 'Thiếu nội dung câu hỏi hoặc đáp án.', type: 'missing_required' });
      return;
    }

    const duplicateQuestion = findSimilarQuestion(normalized.content, [...existingQuestions, ...importableQuestions]);
    if (duplicateQuestion) {
      skipped.push({
        index,
        slot: sourceQuestion.slot,
        reason: 'Câu hỏi này đã có trong hệ thống.',
        type: 'duplicate',
        similarity: Number(duplicateQuestion.similarity.toFixed(2)),
        duplicateId: duplicateQuestion.id
      });
      return;
    }

    importableQuestions.push({
      id: `q_${now}_${index}`,
      subjectId,
      content: normalized.content,
      answer: normalized.answer,
      quizName: normalized.quizName,
      tags: normalized.tags,
      createdAt: new Date(now + index).toISOString(),
      sourceId: sourceQuestion.id || null,
      sourceSlot: sourceQuestion.slot || null
    });
  });

  return {
    totalCount: sourceQuestions.length,
    importableCount: importableQuestions.length,
    skippedCount: skipped.length,
    missingRequiredCount: skipped.filter(item => item.type === 'missing_required').length,
    duplicateCount: skipped.filter(item => item.type === 'duplicate').length,
    importableQuestions,
    skipped
  };
}

async function validateImportRequest(req) {
  const { subjectId, questions: directQuestions } = req.body;
  const quizName = normalizeQuizName(req.body?.quizName || req.body?.quiz?.name);
  const sourceQuestions = Array.isArray(directQuestions) ? directQuestions : getQuestionArray(req.body);

  if (!subjectId) {
    return { error: { status: 400, message: 'Vui lòng chọn môn học trước khi import.' } };
  }
  if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
    return { error: { status: 400, message: 'File JSON không có mảng questions hợp lệ.' } };
  }

  const db = await readDb();
  const subjectExists = db.subjects.some(s => s.id === subjectId);
  if (!subjectExists) {
    return { error: { status: 400, message: 'Môn học không tồn tại trong hệ thống.' } };
  }

  return { subjectId, sourceQuestions, quizName, db };
}

/**
 * Lấy danh sách câu hỏi (hỗ trợ lọc theo subjectId và tìm kiếm thời gian thực)
 */
export async function getQuestions(req, res, next) {
  try {
    const { subjectId, search, quizName } = req.query;
    const db = await readDb();
    let result = db.questions;

    // Lọc theo môn học nếu có
    if (subjectId) {
      result = result.filter(q => q.subjectId === subjectId);
    }

    if (quizName && quizName.trim() !== '') {
      const normalizedQuizName = normalizeQuizName(quizName);
      result = result.filter(q => normalizeQuizName(q.quizName) === normalizedQuizName);
    }

    // Tìm kiếm nếu có
    if (search && search.trim() !== '') {
      const searchKeyword = search.trim().toLowerCase();
      result = result.filter(q => {
        const matchContent = q.content && q.content.toLowerCase().includes(searchKeyword);
        const matchAnswer = q.answer && q.answer.toLowerCase().includes(searchKeyword);
        const matchTags = q.tags && q.tags.some(tag => tag.toLowerCase().includes(searchKeyword));
        const matchQuizName = normalizeQuizName(q.quizName).toLowerCase().includes(searchKeyword);
        return matchContent || matchAnswer || matchTags || matchQuizName;
      });
    }

    // Sắp xếp câu hỏi mới nhất lên đầu
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function getQuestionStats(req, res, next) {
  try {
    const db = await readDb();
    const countsBySubject = {};
    const quizNamesBySubject = {};

    db.questions.forEach(question => {
      countsBySubject[question.subjectId] = (countsBySubject[question.subjectId] || 0) + 1;
      if (!quizNamesBySubject[question.subjectId]) {
        quizNamesBySubject[question.subjectId] = new Set();
      }
      quizNamesBySubject[question.subjectId].add(normalizeQuizName(question.quizName));
    });

    const normalizedQuizNamesBySubject = Object.fromEntries(
      Object.entries(quizNamesBySubject).map(([subjectId, quizNames]) => [
        subjectId,
        Array.from(quizNames).sort((a, b) => a.localeCompare(b, 'vi'))
      ])
    );

    res.json({
      success: true,
      data: {
        total: db.questions.length,
        countsBySubject,
        quizNamesBySubject: normalizedQuizNamesBySubject
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Thêm câu hỏi mới vào môn học
 */
export async function createQuestion(req, res, next) {
  try {
    const { subjectId, content, answer, tags, quizName } = req.body;

    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'ID môn học là bắt buộc' });
    }
    if (!content || content.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nội dung câu hỏi không được để trống' });
    }
    if (!answer || answer.trim() === '') {
      return res.status(400).json({ success: false, message: 'Đáp án câu hỏi không được để trống' });
    }

    const db = await readDb();

    // Kiểm tra xem môn học có tồn tại không
    const subjectExists = db.subjects.some(s => s.id === subjectId);
    if (!subjectExists) {
      return res.status(400).json({ success: false, message: 'Môn học không tồn tại trong hệ thống' });
    }

    const duplicateQuestion = findSimilarQuestion(content, db.questions);
    if (duplicateQuestion) {
      const percent = Math.round(duplicateQuestion.similarity * 100);
      return res.status(409).json({
        success: false,
        message: `Câu hỏi này đã có trong hệ thống (${percent}% giống câu hỏi hiện có).`,
        data: { duplicate: duplicateQuestion }
      });
    }

    // Xử lý tags (đảm bảo là mảng các từ viết thường và cắt khoảng trắng)
    let processedTags = [];
    if (Array.isArray(tags)) {
      processedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t !== '');
    } else if (typeof tags === 'string') {
      processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
    }

    const newQuestion = {
      id: 'q_' + Date.now(),
      subjectId: subjectId,
      content: content.trim(),
      answer: answer.trim(),
      quizName: normalizeQuizName(quizName),
      tags: processedTags,
      createdAt: new Date().toISOString()
    };

    db.questions.push(newQuestion);
    await writeDb(db);

    res.status(201).json({
      success: true,
      message: 'Thêm câu hỏi thành công',
      data: newQuestion
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật nội dung câu hỏi
 */
export async function updateQuestion(req, res, next) {
  try {
    const { id } = req.params;
    const { subjectId, content, answer, tags, quizName } = req.body;

    const db = await readDb();
    const questionIndex = db.questions.findIndex(q => q.id === id);

    if (questionIndex === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi để cập nhật' });
    }

    // Nếu thay đổi môn học, kiểm tra tính hợp lệ
    if (subjectId) {
      const subjectExists = db.subjects.some(s => s.id === subjectId);
      if (!subjectExists) {
        return res.status(400).json({ success: false, message: 'Môn học mới không tồn tại trong hệ thống' });
      }
      db.questions[questionIndex].subjectId = subjectId;
    }

    if (content !== undefined) {
      if (content.trim() === '') {
        return res.status(400).json({ success: false, message: 'Nội dung câu hỏi không được để trống' });
      }

      const duplicateQuestion = findSimilarQuestion(content, db.questions, id);
      if (duplicateQuestion) {
        const percent = Math.round(duplicateQuestion.similarity * 100);
        return res.status(409).json({
          success: false,
          message: `Câu hỏi này đã có trong hệ thống (${percent}% giống câu hỏi hiện có).`,
          data: { duplicate: duplicateQuestion }
        });
      }

      db.questions[questionIndex].content = content.trim();
    }

    if (answer !== undefined) {
      if (answer.trim() === '') {
        return res.status(400).json({ success: false, message: 'Đáp án không được để trống' });
      }
      db.questions[questionIndex].answer = answer.trim();
    }

    if (quizName !== undefined) {
      db.questions[questionIndex].quizName = normalizeQuizName(quizName);
    } else if (!db.questions[questionIndex].quizName) {
      db.questions[questionIndex].quizName = DEFAULT_QUIZ_NAME;
    }

    if (tags !== undefined) {
      let processedTags = [];
      if (Array.isArray(tags)) {
        processedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t !== '');
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
      }
      db.questions[questionIndex].tags = processedTags;
    }

    await writeDb(db);

    res.json({
      success: true,
      message: 'Cập nhật câu hỏi thành công',
      data: db.questions[questionIndex]
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa câu hỏi khỏi ngân hàng đề
 */
export async function deleteQuestion(req, res, next) {
  try {
    const { id } = req.params;
    const db = await readDb();

    const questionIndex = db.questions.findIndex(q => q.id === id);
    if (questionIndex === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi' });
    }

    db.questions.splice(questionIndex, 1);
    await writeDb(db);

    res.json({
      success: true,
      message: 'Xóa câu hỏi thành công!'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Preview câu hỏi từ JSON trước khi import thật
 */
export async function previewImportQuestions(req, res, next) {
  try {
    const validation = await validateImportRequest(req);
    if (validation.error) {
      return res.status(validation.error.status).json({ success: false, message: validation.error.message });
    }

    const analysis = buildImportAnalysis(validation.sourceQuestions, validation.db.questions, validation.subjectId, validation.quizName);

    res.json({
      success: true,
      message: 'Đã phân tích file JSON import.',
      data: {
        totalCount: analysis.totalCount,
        importableCount: analysis.importableCount,
        skippedCount: analysis.skippedCount,
        missingRequiredCount: analysis.missingRequiredCount,
        duplicateCount: analysis.duplicateCount,
        skipped: analysis.skipped,
        previewQuestions: analysis.importableQuestions.slice(0, 5)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Import câu hỏi từ JSON dạng Moodle/API: { questions: [...] }
 */
export async function importQuestions(req, res, next) {
  try {
    const validation = await validateImportRequest(req);
    if (validation.error) {
      return res.status(validation.error.status).json({ success: false, message: validation.error.message });
    }

    const analysis = buildImportAnalysis(validation.sourceQuestions, validation.db.questions, validation.subjectId, validation.quizName);
    const importedQuestions = analysis.importableQuestions.map(question => ({
      ...question,
      quizName: normalizeQuizName(question.quizName || validation.quizName || req.body?.quiz?.name)
    }));
    const skipped = analysis.skipped;

    if (importedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: skipped.some(item => item.type === 'duplicate') ? 'Các câu hỏi trong file đã có trong hệ thống.' : 'Không có câu hỏi hợp lệ để import.',
        skipped
      });
    }

    await appendQuestions(importedQuestions);

    res.status(201).json({
      success: true,
      message: `Đã import ${importedQuestions.length} câu hỏi thành công.`,
      data: {
        importedCount: importedQuestions.length,
        skippedCount: skipped.length,
        skipped,
        questions: importedQuestions
      }
    });
  } catch (error) {
    next(error);
  }
}
