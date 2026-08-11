import { appendQuestions, readDb, readSubjectImportDb, writeDb } from '../services/dbService.js';
import {
  getQuestionById,
  getQuestionStatsData,
  getSubjectById,
  insertQuestion,
  listQuestionCandidates,
  listQuestions,
  removeQuestion,
  updateQuestionById
} from '../services/dbService.js';
import {
  cleanupReplacedQuestionImages,
  deleteManagedImages,
  deleteQuestionImageFolder,
  syncQuestionImages
} from '../services/questionImageService.js';

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
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+/gi, ' ')
    .replace(/https:\/\/[^\s<>'"]+?\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\s<>'"]*)?/gi, ' ')
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

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  let currentRow = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const insertCost = currentRow[j - 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const replaceCost = previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      currentRow[j] = Math.min(insertCost, deleteCost, replaceCost);
    }
    const completedRow = previousRow;
    previousRow = currentRow;
    currentRow = completedRow;
  }

  return previousRow[b.length];
}

function createTrigrams(value) {
  const trigrams = new Set();
  for (let index = 0; index <= value.length - 3; index += 1) {
    trigrams.add(value.slice(index, index + 3));
  }
  return trigrams;
}

function prepareQuestionCandidate(question = {}) {
  const normalizedContent = question.normalizedContent || normalizeQuestionForCompare(question.content || '');
  return {
    ...question,
    normalizedContent,
    trigrams: question.trigrams || createTrigrams(normalizedContent)
  };
}

function hasPotentialSimilarity(first, second) {
  if (!first || !second) return false;
  const maxLength = Math.max(first.normalizedContent.length, second.normalizedContent.length);
  const minLength = Math.min(first.normalizedContent.length, second.normalizedContent.length);
  if (minLength / maxLength < DUPLICATE_SIMILARITY_THRESHOLD) return false;
  if (first.trigrams.size === 0 || second.trigrams.size === 0) return true;

  let overlap = 0;
  const smallerSet = first.trigrams.size <= second.trigrams.size ? first.trigrams : second.trigrams;
  const largerSet = smallerSet === first.trigrams ? second.trigrams : first.trigrams;
  for (const trigram of smallerSet) {
    if (largerSet.has(trigram)) overlap += 1;
  }
  return (2 * overlap) / (first.trigrams.size + second.trigrams.size) >= 0.5;
}

function calculateQuestionSimilarity(normalizedA, normalizedB) {
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  const distance = levenshteinDistance(normalizedA, normalizedB);
  return 1 - distance / maxLength;
}

function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

async function findSimilarQuestion(content, questions, excludeId = null) {
  let bestMatch = null;
  const target = prepareQuestionCandidate({ content });

  for (let index = 0; index < questions.length; index += 1) {
    const question = prepareQuestionCandidate(questions[index]);
    if (excludeId && question.id === excludeId) continue;
    if (!hasPotentialSimilarity(target, question)) continue;
    const similarity = calculateQuestionSimilarity(target.normalizedContent, question.normalizedContent);
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        id: question.id,
        content: question.content,
        similarity
      };
    }
    if (index > 0 && index % 200 === 0) await yieldToEventLoop();
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

function replaceImportedImageTokens(value, images) {
  if (typeof value !== 'string') return value;
  return value.replace(/__QUESTION_IMAGE_\d+__/g, token => images[token] || token);
}

function hydrateImportedQuestionImages(question, images) {
  if (!question || typeof question !== 'object') return question;
  return {
    ...question,
    questiontext: replaceImportedImageTokens(question.questiontext, images),
    questionText: replaceImportedImageTokens(question.questionText, images),
    content: replaceImportedImageTokens(question.content, images),
    generalfeedback: replaceImportedImageTokens(question.generalfeedback, images),
    generalFeedback: replaceImportedImageTokens(question.generalFeedback, images),
    answer: replaceImportedImageTokens(question.answer, images),
    rightanswer: replaceImportedImageTokens(question.rightanswer, images),
    rightAnswer: replaceImportedImageTokens(question.rightAnswer, images),
    answertext: Array.isArray(question.answertext) ? question.answertext.map(answer => ({
      ...answer,
      answer: replaceImportedImageTokens(answer.answer, images),
      text: replaceImportedImageTokens(answer.text, images)
    })) : question.answertext
  };
}

function getImportedImageMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([token, source]) => (
    /^__QUESTION_IMAGE_\d+__$/.test(token)
    && typeof source === 'string'
    && source.startsWith('data:image/')
  )));
}

function stripQuestionNumberPrefix(content = '') {
  return String(content)
    .replace(/^\s*c(?:a|\u00e2)u\s*\d+\s*[:.\-)\u2013\u2014]?\s*/i, '')
    .replace(/^\s*\d+\s*\/\s*\d+\s*(?:\u0111i\u1ec3m|diem|point|points)\s*/i, '')
    .trim();
}

function stripHtmlPreservingImages(html = '') {
  const images = [];
  const textWithTokens = String(html || '').replace(/<img\b[^>]*>/gi, image => {
    const token = `QUESTIONIMAGETOKEN${images.length}END`;
    images.push(image);
    return '\n' + token + '\n';
  });
  let text = stripHtml(textWithTokens);
  images.forEach((image, index) => {
    text = text.replace(`QUESTIONIMAGETOKEN${index}END`, image);
  });
  return text.trim();
}

function removeAnswerOptionLinesFromQuestionHtml(content = '') {
  const parts = String(content || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .split(/\r?\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/^[A-Z]\s*[.)]\s+/i.test(stripHtml(part)));
  return parts.join('<br>').trim();
}

function normalizeImportedQuestion(sourceQuestion, quizName = DEFAULT_QUIZ_NAME) {
  const rawQuestionContent = String(sourceQuestion.questiontext || sourceQuestion.questionText || sourceQuestion.content || '').trim();
  const questionText = removeAnswerOptionLinesFromQuestionHtml(stripQuestionNumberPrefix(rawQuestionContent));
  const answers = Array.isArray(sourceQuestion.answertext) ? sourceQuestion.answertext : [];

  const correctAnswers = answers
    .filter(answer => answer.iscorrect === true || Number(answer.fraction) > 0)
    .map(answer => stripHtmlPreservingImages(answer.answer || answer.text || ''))
    .filter(Boolean);

  const generalFeedback = stripHtmlPreservingImages(sourceQuestion.generalfeedback || sourceQuestion.generalFeedback || sourceQuestion.answer || '');
  const rightAnswer = stripHtmlPreservingImages(sourceQuestion.rightanswer || sourceQuestion.rightAnswer || '');
  const answerParts = [];

  if (generalFeedback) {
    answerParts.push(generalFeedback);
  } else if (rightAnswer) {
    answerParts.push(`Đáp án đúng là: ${rightAnswer}`);
  } else if (correctAnswers.length > 0) {
    answerParts.push(`Đáp án đúng là: ${correctAnswers.join('; ')}`);
  }

  return {
    content: questionText.trim(),
    answer: answerParts.join('\n\n').trim(),
    quizName: normalizeQuizName(sourceQuestion.quizName || sourceQuestion.quiz?.name || quizName),
    tags: ['json', 'import', sourceQuestion.type || 'question'].filter(Boolean)
  };
}

async function buildImportAnalysis(sourceQuestions, existingQuestions, subjectId, quizName = DEFAULT_QUIZ_NAME, now = Date.now()) {
  const importableQuestions = [];
  const skipped = [];
  const candidates = existingQuestions.map(prepareQuestionCandidate);

  for (let index = 0; index < sourceQuestions.length; index += 1) {
    const sourceQuestion = sourceQuestions[index];
    const normalized = normalizeImportedQuestion(sourceQuestion, quizName);
    if (!normalized.content || !normalized.answer) {
      skipped.push({ index, slot: sourceQuestion.slot, reason: 'Thiếu nội dung câu hỏi hoặc đáp án.', type: 'missing_required' });
      continue;
    }

    const duplicateQuestion = await findSimilarQuestion(normalized.content, candidates);
    if (duplicateQuestion) {
      skipped.push({
        index,
        slot: sourceQuestion.slot,
        reason: 'Câu hỏi này đã có trong hệ thống.',
        type: 'duplicate',
        similarity: Number(duplicateQuestion.similarity.toFixed(2)),
        duplicateId: duplicateQuestion.id
      });
      continue;
    }

    const importableQuestion = {
      id: `q_${now}_${index}`,
      subjectId,
      content: normalized.content,
      answer: normalized.answer,
      quizName: normalized.quizName,
      tags: normalized.tags,
      createdAt: new Date(now + index).toISOString(),
      sourceId: sourceQuestion.id || null,
      sourceSlot: sourceQuestion.slot || null
    };
    importableQuestions.push(importableQuestion);
    candidates.push(prepareQuestionCandidate(importableQuestion));
    if (index > 0 && index % 10 === 0) await yieldToEventLoop();
  }

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

async function syncImportedQuestionImages(questions, importedImages, concurrency = 3) {
  const syncedQuestions = [];
  const uploadedPaths = [];
  const imageWarnings = [];

  for (let index = 0; index < questions.length; index += concurrency) {
    const batch = questions.slice(index, index + concurrency);
    const hydratedBatch = batch.map(question => hydrateImportedQuestionImages(question, importedImages));
    const results = await Promise.allSettled(hydratedBatch.map(question => syncQuestionImages(question)));
    const batchUploadedPaths = results.flatMap(result => result.status === 'fulfilled' ? result.value.uploadedPaths : []);
    const rejectedResult = results.find(result => result.status === 'rejected');
    if (rejectedResult) {
      await deleteManagedImages([...uploadedPaths, ...batchUploadedPaths]);
      throw rejectedResult.reason;
    }

    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results[resultIndex];
      const question = batch[resultIndex];
      syncedQuestions.push(result.value.question);
      uploadedPaths.push(...result.value.uploadedPaths);
      imageWarnings.push(...result.value.failures.map(failure => ({ questionId: question.id, ...failure })));
    }

    await yieldToEventLoop();
  }

  return { syncedQuestions, uploadedPaths, imageWarnings };
}

async function validateImportRequest(req) {
  const { subjectId, questions: directQuestions } = req.body;
  const quizName = normalizeQuizName(req.body?.quizName || req.body?.quiz?.name);
  const rawSourceQuestions = Array.isArray(directQuestions) ? directQuestions : getQuestionArray(req.body);
  const importedImages = getImportedImageMap(req.body?.images);
  const sourceQuestions = rawSourceQuestions;

  if (!subjectId) {
    return { error: { status: 400, message: 'Vui l\u00f2ng ch\u1ecdn m\u00f4n h\u1ecdc tr\u01b0\u1edbc khi import.' } };
  }
  if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
    return { error: { status: 400, message: 'File JSON kh\u00f4ng c\u00f3 m\u1ea3ng questions h\u1ee3p l\u1ec7.' } };
  }

  const db = await readSubjectImportDb(subjectId);
  const subjectExists = db.subjects.some(s => s.id === subjectId);
  if (!subjectExists) {
    return { error: { status: 400, message: 'M\u00f4n h\u1ecdc kh\u00f4ng t\u1ed3n t\u1ea1i trong h\u1ec7 th\u1ed1ng.' } };
  }

  return { subjectId, sourceQuestions, importedImages, quizName, db };
}

/**
 * Lấy danh sách câu hỏi (hỗ trợ lọc theo subjectId và tìm kiếm thời gian thực)
 */
export async function getQuestions(req, res, next) {
  try {
    const { subjectId, search, quizName } = req.query;
    const limit = Math.min(200, Math.max(0, Number.parseInt(req.query.limit, 10) || 0));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const result = await listQuestions({ subjectId, search, quizName, limit, offset });
    res.json({
      success: true,
      data: limit ? result.items : result,
      pagination: limit ? {
        total: result.total,
        limit,
        offset,
        hasMore: offset + result.items.length < result.total
      } : undefined
    });
  } catch (error) {
    next(error);
  }
}

export async function getQuestionStats(req, res, next) {
  try {
    res.json({
      success: true,
      data: await getQuestionStatsData()
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

    if (!await getSubjectById(subjectId)) {
      return res.status(400).json({ success: false, message: 'Môn học không tồn tại trong hệ thống' });
    }

    const duplicateQuestion = await findSimilarQuestion(content, await listQuestionCandidates());
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

    const imageSync = await syncQuestionImages(newQuestion);
    let createdQuestion;
    try {
      createdQuestion = await insertQuestion(imageSync.question);
    } catch (error) {
      await deleteManagedImages(imageSync.uploadedPaths);
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'Thêm câu hỏi thành công',
      data: createdQuestion,
      imageWarnings: imageSync.failures
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

    const existingQuestion = await getQuestionById(id);
    if (!existingQuestion) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi để cập nhật' });
    }
    const changes = {};

    // Nếu thay đổi môn học, kiểm tra tính hợp lệ
    if (subjectId) {
      if (!await getSubjectById(subjectId)) {
        return res.status(400).json({ success: false, message: 'Môn học mới không tồn tại trong hệ thống' });
      }
      changes.subjectId = subjectId;
    }

    if (content !== undefined) {
      if (content.trim() === '') {
        return res.status(400).json({ success: false, message: 'Nội dung câu hỏi không được để trống' });
      }

      const duplicateQuestion = await findSimilarQuestion(content, await listQuestionCandidates(id));
      if (duplicateQuestion) {
        const percent = Math.round(duplicateQuestion.similarity * 100);
        return res.status(409).json({
          success: false,
          message: `Câu hỏi này đã có trong hệ thống (${percent}% giống câu hỏi hiện có).`,
          data: { duplicate: duplicateQuestion }
        });
      }

      changes.content = content.trim();
    }

    if (answer !== undefined) {
      if (answer.trim() === '') {
        return res.status(400).json({ success: false, message: 'Đáp án không được để trống' });
      }
      changes.answer = answer.trim();
    }

    if (quizName !== undefined) {
      changes.quizName = normalizeQuizName(quizName);
    } else if (!existingQuestion.quizName) {
      changes.quizName = DEFAULT_QUIZ_NAME;
    }

    if (tags !== undefined) {
      let processedTags = [];
      if (Array.isArray(tags)) {
        processedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t !== '');
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
      }
      changes.tags = processedTags;
    }

    const imageSync = await syncQuestionImages({
      ...existingQuestion,
      ...changes,
      id,
      subjectId: changes.subjectId || existingQuestion.subjectId,
      content: changes.content ?? existingQuestion.content,
      answer: changes.answer ?? existingQuestion.answer
    });
    changes.content = imageSync.question.content;
    changes.answer = imageSync.question.answer;

    let updatedQuestion;
    try {
      updatedQuestion = await updateQuestionById(id, changes);
    } catch (error) {
      await deleteManagedImages(imageSync.uploadedPaths);
      throw error;
    }
    const cleanupResult = await cleanupReplacedQuestionImages(existingQuestion, updatedQuestion);
    if (cleanupResult.error) {
      console.error('[question-images] Failed to remove replaced images:', cleanupResult.error.message);
    }

    res.json({
      success: true,
      message: 'Cập nhật câu hỏi thành công',
      data: updatedQuestion,
      imageWarnings: imageSync.failures
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
    const existingQuestion = await getQuestionById(req.params.id);
    if (!existingQuestion) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi' });
    }
    if (!await removeQuestion(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi' });
    }
    const cleanupResult = await deleteQuestionImageFolder(existingQuestion);
    if (cleanupResult.error) {
      console.error('[question-images] Failed to remove deleted question images:', cleanupResult.error.message);
    }

    res.json({
      success: true,
      message: 'Xóa câu hỏi thành công!',
      imageCleanup: {
        deletedCount: cleanupResult.deletedCount,
        success: !cleanupResult.error
      }
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

    const analysis = await buildImportAnalysis(validation.sourceQuestions, validation.db.questions, validation.subjectId, validation.quizName);

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

    const analysis = await buildImportAnalysis(validation.sourceQuestions, validation.db.questions, validation.subjectId, validation.quizName);
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

    const { syncedQuestions, uploadedPaths, imageWarnings } = await syncImportedQuestionImages(
      importedQuestions,
      validation.importedImages
    );

    try {
      await appendQuestions(syncedQuestions);
    } catch (error) {
      await deleteManagedImages(uploadedPaths);
      throw error;
    }

    res.status(201).json({
      success: true,
      message: `Đã import ${importedQuestions.length} câu hỏi thành công.`,
      data: {
        importedCount: importedQuestions.length,
        skippedCount: skipped.length,
        skipped,
        questions: syncedQuestions,
        imageWarnings
      }
    });
  } catch (error) {
    next(error);
  }
}
