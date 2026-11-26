import { getSubjectByName, readAllQuestionsCached } from './dbService.js';
import { similarityRatio, similarityUpperBound } from '../utils/textSimilarity.js';
import { exceedsQuestionTextLimit, httpError, MAX_QUESTION_TEXT_CHARS } from '../utils/httpError.js';

const MAX_SOLVE_QUESTIONS = Math.max(1, Number(process.env.MAX_SOLVE_QUESTIONS || 300));
// Đề bài sau chuẩn hóa ngắn hơn ngưỡng này bị coi là chung chung, cần đối chiếu thêm lựa chọn
const GENERIC_STEM_MAX_CHARS = 60;
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
// Alias của Google luôn trỏ tới bản Gemini Flash mới nhất
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

const STORED_QUESTION_SIMILARITY_THRESHOLD = 0.5;
const IMAGE_URL_PATTERN = /https:\/\/[^\s<>'"]{1,2048}?\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\s<>'"]{0,2048})?/gi;
const AUDIO_URL_PATTERN = /https:\/\/[^\s<>'"]{1,2048}?\.(?:mp3|m4a|aac|ogg|oga|wav|webm)(?:\?[^\s<>'"]{0,2048})?/gi;

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = '') {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeAudioKey(value = '') {
  const decoded = decodeEntities(value).trim();
  try {
    return decodeURIComponent(decoded);
  } catch (error) {
    return decoded;
  }
}

function isAudioUrl(value = '') {
  AUDIO_URL_PATTERN.lastIndex = 0;
  const matched = AUDIO_URL_PATTERN.test(String(value || '').trim());
  AUDIO_URL_PATTERN.lastIndex = 0;
  return matched;
}

function getTagAttribute(tag = '', name = '') {
  const match = String(tag || '').match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'));
  return match ? decodeAudioKey(match[1]) : '';
}

function getLiteralTagAttribute(tag = '', name = '') {
  const match = String(tag || '').match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function isImageUrl(value = '') {
  IMAGE_URL_PATTERN.lastIndex = 0;
  const matched = IMAGE_URL_PATTERN.test(String(value || '').trim());
  IMAGE_URL_PATTERN.lastIndex = 0;
  return matched;
}

function extractImageKeys(value = '') {
  const html = String(value || '');
  const keys = [];
  let remaining = html.replace(/<!--\s*question-image-key:([\s\S]*?)-->/gi, (marker, encodedKey) => {
    const storedKey = decodeEntities(encodedKey).trim();
    try {
      keys.push(decodeURIComponent(storedKey));
    } catch (error) {
      keys.push(storedKey);
    }
    return ' ';
  });
  const markerKeys = keys.splice(0);
  const taggedSources = new Set();
  remaining = remaining.replace(/<img\b[^>]*>/gi, imageTag => {
    const source = getLiteralTagAttribute(imageTag, 'src');
    taggedSources.add(source);
    const hash = source.match(/\/([a-f0-9]{24})\.[a-z0-9]+(?:[?#]|$)/i)?.[1];
    if (hash) taggedSources.add('sha256:' + hash.toLowerCase());
    const storedKey = getLiteralTagAttribute(imageTag, 'data-image-key');
    if (storedKey) {
      try {
        keys.push(decodeURIComponent(storedKey));
      } catch (error) {
        keys.push(storedKey);
      }
      return ' ';
    }
    if (source) keys.push(source);
    return ' ';
  });
  const originalKeys = markerKeys.filter(key => key && !taggedSources.has(key) && !keys.includes(key));
  keys.push(...originalKeys);
  remaining = remaining.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (link, href) => {
    const source = decodeEntities(href).trim();
    if (taggedSources.has(source)) return ' ';
    if (originalKeys.length > 0 && /\/storage\/v1\/object\/public\//.test(source)) return ' ';
    if (isImageUrl(source)) keys.push(source);
    return ' ';
  });
  remaining.match(IMAGE_URL_PATTERN)?.forEach(source => {
    if (taggedSources.has(decodeEntities(source).trim())) return;
    if (originalKeys.length > 0 && /\/storage\/v1\/object\/public\//.test(source)) return;
    keys.push(decodeEntities(source).trim());
  });
  return [...new Set(keys.filter(Boolean))];
}

function removeImageUrls(value = '') {
  return String(value || '').replace(IMAGE_URL_PATTERN, ' ');
}

function removeImageMarkup(value = '') {
  return removeImageUrls(String(value || '')
    .replace(/<!--\s*question-image-key:[\s\S]*?-->/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<a\b[^>]*href=["'][^"']+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^"']*)?["'][^>]*>[\s\S]*?<\/a>/gi, ' '));
}

function extractAudioKeys(value = '') {
  const html = String(value || '');
  const keys = [];
  let remaining = html.replace(/<audio\b[\s\S]*?<\/audio>/gi, audioHtml => {
    const openingTag = audioHtml.match(/<audio\b[^>]*>/i)?.[0] || '';
    const storedKey = getTagAttribute(openingTag, 'data-audio-key');
    if (storedKey) {
      keys.push(storedKey);
      return ' ';
    }
    const audioSource = getTagAttribute(openingTag, 'src');
    if (audioSource) keys.push(audioSource);
    audioHtml.replace(/<source\b[^>]*>/gi, sourceTag => {
      const source = getTagAttribute(sourceTag, 'src');
      if (source) keys.push(source);
      return sourceTag;
    });
    return ' ';
  });
  remaining = remaining.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (link, href) => {
    const source = decodeAudioKey(href);
    if (isAudioUrl(source)) keys.push(source);
    return ' ';
  });
  remaining.match(AUDIO_URL_PATTERN)?.forEach(source => keys.push(decodeAudioKey(source)));
  return [...new Set(keys.filter(Boolean))];
}

function removeAudioUrls(value = '') {
  return String(value || '').replace(AUDIO_URL_PATTERN, ' ');
}

function hasSameAudioKeys(firstValue = '', secondValue = '') {
  const firstKeys = extractAudioKeys(firstValue);
  const secondKeys = extractAudioKeys(secondValue);
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every((key, index) => key === secondKeys[index]);
}

function hasSameMediaKeyLists(firstKeys = [], secondKeys = []) {
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every((key, index) => key === secondKeys[index]);
}

function removeAudioMarkup(value = '') {
  return removeAudioUrls(String(value || '')
    .replace(/<audio\b[\s\S]*?<\/audio>/gi, ' ')
    .replace(/<a\b[^>]*href=["'][^"']+\.(?:mp3|m4a|aac|ogg|oga|wav|webm)(?:\?[^"']*)?["'][^>]*>[\s\S]*?<\/a>/gi, ' '));
}

function extractQuestionStem(value = '') {
  const mediaFreeValue = removeImageMarkup(removeAudioMarkup(value));
  const lines = htmlToLines(mediaFreeValue);
  const stemLines = [];
  for (const line of lines) {
    if (/^\d+\s*[.)]\s+/i.test(line)) break;
    if (/^[A-Z]\s*[.)]\s+/i.test(line)) break;
    stemLines.push(line);
  }
  return (stemLines.join(' ') || stripHtml(mediaFreeValue)).replace(/\s+/g, ' ').trim();
}

function htmlToLines(value = '') {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeQuestion(question = {}, index = 0) {
  const answers = Array.isArray(question.answertext) ? question.answertext : [];
  const questionHtml = String(question.questiontext || question.content || '').trim();
  const serializedQuestion = JSON.stringify(question);
  const imageKeys = extractImageKeys(questionHtml);
  const audioKeys = extractAudioKeys(questionHtml + ' ' + serializedQuestion);
  const normalizedAnswers = answers.map((answer, answerIndex) => ({
    id: answer.id || null,
    label: String.fromCharCode(65 + answerIndex),
    text: stripHtml(answer.answer || answer.text || ''),
    questionText: stripHtml(answer.question || '')
  })).filter(answer => answer.text || answer.questionText);
  return {
    id: question.id || null,
    slot: question.slot || index + 1,
    type: question.type || '',
    questionHtml,
    questiontext: extractQuestionStem(questionHtml),
    imageKeys,
    audioKeys,
    answers: normalizedAnswers,
    isComposite: normalizedAnswers.some(answer => answer.questionText)
  };
}

function buildPrompt(questions = []) {
  const questionText = questions.map(question => {
    if (question.isComposite) {
      const parts = question.answers
        .filter(answer => answer.questionText)
        .map(answer => answer.questionText)
        .join('\n');
      return `Cau ${question.slot} (id: ${question.id || 'N/A'}) - cau nhieu phan:\n${question.questiontext}\nCac cau con va lua chon:\n${parts}`;
    }
    const answers = question.answers.map(answer => `${answer.label}. ${answer.text}`).join('\n');
    return `Cau ${question.slot} (id: ${question.id || 'N/A'}): ${question.questiontext}\n${answers}`;
  }).join('\n\n');

  return `Ban la tro ly hoc tap. Hay tra loi cac cau hoi trac nghiem sau bang tieng Viet.\n` +
    `Chi tra ve JSON hop le, khong markdown, khong chu ngoai JSON.\n` +
    `Khong dung dau phay cuoi mang/object.\n` +
    `Cau truc bat buoc: {"answers":[{"slot":1,"questionId":123,"answerLabel":"A","answerText":"noi dung dap an","confidence":0.8,"explanation":"giai thich"}]}\n` +
    `Giu nguyen slot va questionId dung nhu de bai da gui, khong danh so lai tu 1.\n` +
    `Voi cau thong thuong: tra answerLabel va answerText cua mot dap an dung.\n` +
    `Voi cau nhieu phan: answerText phai liet ke day du dap an tung cau con theo dang "1. ...\\n2. ..."; explanation giai thich ngan gon tung cau con.\n` +
    `Khong can tra answerId. Neu khong chac, van chon dap an hop ly nhat.\n\n${questionText}`;
}

function normalizeStoredQuestionForCompare(content = '') {
  return String(content || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^\s*cau\s*\d+\s*[:.\-\)]?/i, '')
    .replace(/\b\d+\s*\/\s*\d+\s*(diem|point|points)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function getQuestionCompareText(question = {}) {
  return extractQuestionStem(question.questionHtml || question.questiontext || '');
}

function extractStoredQuestionText(content = '') {
  const baseContent = String(content || '').split(/<div>\s*<hr\b[^>]*>/i)[0];
  const lines = htmlToLines(baseContent);
  const questionLines = [];
  for (const line of lines) {
    if (/^[A-Z]\s*[\.)]\s+/i.test(line)) break;
    if (/^(Đáp án đúng là|Dap an dung la)\s*:/i.test(line)) break;
    if (/^Vì\s*:/i.test(line)) break;
    if (/^Vi\s*:/i.test(line)) break;
    if (/^Tham khảo\s*:/i.test(line)) break;
    if (/^Tham khao\s*:/i.test(line)) break;
    questionLines.push(line);
  }
  return removeImageUrls(removeAudioUrls(questionLines.join(' ') || stripHtml(content))).replace(/\s+/g, ' ').trim();
}

function extractStoredCorrectAnswer(answerText = '') {
  const cleanAnswer = stripHtml(answerText || '');
  const match = cleanAnswer.match(/(?:Đáp án đúng là|Dap an dung la)\s*:\s*([^\n]+)/i);
  return (match?.[1] || cleanAnswer.split('\n')[0] || '').trim();
}

function formatStoredAnswer(answerText = '') {
  return htmlToLines(answerText).join('\n') || stripHtml(answerText);
}

function findMatchingOption(question = {}, correctAnswerText = '') {
  const cleanCorrect = stripHtml(correctAnswerText || '').trim();
  if (!cleanCorrect) return null;
  const normalizedCorrect = normalizeStoredQuestionForCompare(cleanCorrect);
  return question.answers?.find(option => {
    const normalizedOption = normalizeStoredQuestionForCompare(option.text);
    return normalizedOption && (
      normalizedOption === normalizedCorrect ||
      normalizedCorrect.includes(normalizedOption) ||
      normalizedOption.includes(normalizedCorrect)
    );
  }) || null;
}

// Dữ liệu so sánh của câu hỏi trong DB được tính một lần cho mỗi bản cache của danh sách câu hỏi
const preparedStoredQuestionsCache = new WeakMap();

function prepareStoredQuestions(storedQuestions = []) {
  let prepared = preparedStoredQuestionsCache.get(storedQuestions);
  if (!prepared) {
    prepared = storedQuestions.map(storedQuestion => ({
      storedQuestion,
      imageKeys: extractImageKeys(storedQuestion.content || ''),
      audioKeys: extractAudioKeys(storedQuestion.content || ''),
      compareText: normalizeStoredQuestionForCompare(extractStoredQuestionText(storedQuestion.content || ''))
    }));
    preparedStoredQuestionsCache.set(storedQuestions, prepared);
  }
  return prepared;
}

function findStoredAnswer(question = {}, preparedStoredQuestions = []) {
  const questionCompareText = normalizeStoredQuestionForCompare(getQuestionCompareText(question));
  if (!questionCompareText) return null;
  const similarityThreshold = question.audioKeys.length > 0 ? 0.85 : STORED_QUESTION_SIMILARITY_THRESHOLD;
  const needsOptionCheck = questionCompareText.length < GENERIC_STEM_MAX_CHARS
    && !question.isComposite
    && question.answers.length > 0;
  let bestMatch = null;

  for (const { storedQuestion, imageKeys, audioKeys, compareText } of preparedStoredQuestions) {
    if (!hasSameMediaKeyLists(question.imageKeys, imageKeys)) continue;
    if (!hasSameMediaKeyLists(question.audioKeys, audioKeys)) continue;
    // Bỏ qua sớm khi cận trên của độ giống không thể vượt ngưỡng hoặc kết quả tốt nhất hiện có
    const upperBound = similarityUpperBound(questionCompareText, compareText);
    if (upperBound < similarityThreshold) continue;
    if (bestMatch && upperBound + 0.02 <= bestMatch.score) continue;
    const similarity = similarityRatio(questionCompareText, compareText);
    if (similarity < similarityThreshold) continue;
    const sameSourceId = question.id !== null && question.id !== undefined
      && storedQuestion.sourceId !== null && storedQuestion.sourceId !== undefined
      && String(question.id) === String(storedQuestion.sourceId);
    // Đề ngắn/chung chung ("Phát biểu nào sau đây là ĐÚNG?") trùng ở rất nhiều câu khác nhau:
    // chỉ nhận khi đáp án đã lưu khớp một lựa chọn của câu hiện tại
    if (needsOptionCheck && !sameSourceId
      && !findMatchingOption(question, extractStoredCorrectAnswer(storedQuestion.answer || ''))) continue;
    const score = similarity + (sameSourceId ? 0.02 : 0);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { storedQuestion, similarity, score };
    }
  }
  if (!bestMatch) return null;

  const correctAnswerText = extractStoredCorrectAnswer(bestMatch.storedQuestion.answer || '');
  const matchedOption = findMatchingOption(question, correctAnswerText);
  return {
    slot: question.slot,
    questionId: question.id,
    questionText: question.questiontext,
    questionHtml: question.questionHtml || '',
    source: 'database',
    answerLabel: matchedOption?.label || '',
    answerId: matchedOption?.id || null,
    answerText: matchedOption?.text || correctAnswerText,
    fullAnswerHtml: String(bestMatch.storedQuestion.answer || ''),
    fullAnswerText: formatStoredAnswer(bestMatch.storedQuestion.answer || ''),
    confidence: Number(bestMatch.similarity.toFixed(2)),
    explanation: question.audioKeys?.length > 0
      ? 'Tìm thấy câu hỏi trong Lesson Outline theo nội dung và URL âm thanh.'
      : question.imageKeys?.length > 0
        ? 'Tìm thấy câu hỏi trong Lesson Outline theo nội dung và URL hình ảnh.'
      : 'Tìm thấy câu hỏi trùng trong ngân hàng câu hỏi theo nội dung câu hỏi.'
  };
}

function getCourseSubjectName(payload = {}) {
  if (typeof payload.subjectName === 'string' && payload.subjectName.trim()) return payload.subjectName.trim();
  const course = payload.course && typeof payload.course === 'object' ? payload.course : {};
  const courseName = String(course.name || course.fullname || '').trim();
  if (courseName) return courseName;
  // Cùng cách đặt tên môn như lúc extension import câu hỏi review
  return course.id ? `Môn học ${course.id}` : '';
}

/**
 * Xác định phạm vi tìm câu hỏi theo tên môn (course.name trong dữ liệu attempt của LMS):
 * - subject: môn đã có trong hệ thống, chỉ tìm câu hỏi thuộc môn đó
 * - new_subject: môn chưa có, không tìm trong hệ thống (toàn bộ dùng AI)
 * - all: dữ liệu không có thông tin môn, tìm trên toàn bộ ngân hàng câu hỏi
 */
async function resolveSubjectScope(payload = {}) {
  const subjectName = getCourseSubjectName(payload);
  if (!subjectName) return { type: 'all', subjectId: null, subjectName: '' };
  const subject = await getSubjectByName(subjectName);
  return subject
    ? { type: 'subject', subjectId: subject.id, subjectName: subject.name }
    : { type: 'new_subject', subjectId: null, subjectName };
}

async function findStoredAnswers(questions = [], scope = { type: 'all' }) {
  if (scope.type === 'new_subject') return { matchedAnswers: [], unansweredQuestions: questions };
  const allPrepared = prepareStoredQuestions(await readAllQuestionsCached());
  const preparedStoredQuestions = scope.type === 'subject'
    ? allPrepared.filter(item => item.storedQuestion.subjectId === scope.subjectId)
    : allPrepared;
  const matchedAnswers = [];
  const unansweredQuestions = [];
  for (const question of questions) {
    const storedAnswer = findStoredAnswer(question, preparedStoredQuestions);
    if (storedAnswer) matchedAnswers.push(storedAnswer);
    else unansweredQuestions.push(question);
  }
  return { matchedAnswers, unansweredQuestions };
}

function createUnavailableAudioAnswer(question = {}) {
  return {
    slot: question.slot,
    questionId: question.id,
    questionText: question.questiontext,
    questionHtml: question.questionHtml || '',
    source: 'unavailable',
    answerLabel: '',
    answerId: null,
    answerText: 'Chưa có thông tin trong Lesson Outline.',
    confidence: null,
    explanation: ''
  };
}

function getGeminiModels() {
  const models = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  return models.split(',').map(model => model.trim()).filter(Boolean);
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

// Model đã bị Google gỡ (404) thì bỏ qua ở các request sau, khỏi tốn một lần gọi lỗi
const unavailableGeminiModels = new Set();
// Lỗi tạm thời phía Google (quá tải, hết quota theo phút, timeout): thử lại / đổi model sẽ có thể thành công
const TRANSIENT_GEMINI_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_RETRIES = Math.max(0, Number(process.env.GEMINI_RETRIES ?? 2));
const GEMINI_MAX_FALLBACK_MODELS = Math.max(0, Number(process.env.GEMINI_MAX_FALLBACK_MODELS ?? 2));
// Extension chờ tối đa 180s, nên toàn bộ lượt hỏi AI phải xong trước đó
const GEMINI_TOTAL_TIMEOUT_MS = Math.max(10000, Number(process.env.GEMINI_TOTAL_TIMEOUT_MS || 150000));
const MODEL_LIST_CACHE_MS = 60 * 60 * 1000;
let modelListCache = null;

function compareVersionsDesc(first, second) {
  const firstParts = first.split('.').map(Number);
  const secondParts = second.split('.').map(Number);
  for (let index = 0; index < Math.max(firstParts.length, secondParts.length); index += 1) {
    const difference = (secondParts[index] || 0) - (firstParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function sortByVersion(modelNames, pattern) {
  return modelNames
    .map(name => ({ name, version: name.match(pattern)?.[1] }))
    .filter(item => item.version)
    .sort((first, second) => compareVersionsDesc(first.version, second.version))
    .map(item => item.name);
}

/**
 * Thứ tự model dự phòng: Flash ổn định mới nhất -> alias Flash -> Flash-Lite (nhẹ hơn, thường ít quá tải hơn).
 */
function rankFallbackModels(modelNames = []) {
  const usable = modelNames.filter(name => !unavailableGeminiModels.has(name));
  const ranked = [
    ...sortByVersion(usable, /^gemini-(\d+(?:\.\d+)*)-flash$/),
    ...usable.filter(name => name === DEFAULT_GEMINI_MODEL),
    ...sortByVersion(usable, /^gemini-(\d+(?:\.\d+)*)-flash-lite$/),
    ...usable.filter(name => name === 'gemini-flash-lite-latest')
  ];
  return [...new Set(ranked)];
}

/**
 * Hỏi Google danh sách model còn dùng được (cache 1 giờ).
 */
async function listGeminiModels(apiKey) {
  if (modelListCache && modelListCache.expiresAt > Date.now()) return modelListCache.promise;
  const promise = (async () => {
    const response = await fetch(`${GEMINI_API_BASE_URL}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Gemini ListModels lỗi ${response.status}`);
    return (data?.models || [])
      .filter(model => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map(model => String(model.name || '').replace(/^models\//, ''));
  })();
  modelListCache = { promise, expiresAt: Date.now() + MODEL_LIST_CACHE_MS };
  promise.catch(() => { modelListCache = null; });
  return promise;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientGeminiError(error) {
  return error.transient === true || TRANSIENT_GEMINI_STATUSES.has(error.status);
}

/**
 * Gọi Gemini với các model đã cấu hình, có thử lại khi Google quá tải (503/429...)
 * và tự chuyển sang model Flash khác khi model bị gỡ (404) hoặc vẫn quá tải sau khi thử lại.
 */
async function askGemini(prompt) {
  const apiKey = getGeminiApiKey();
  const deadline = Date.now() + GEMINI_TOTAL_TIMEOUT_MS;
  const triedModels = new Set();
  const errors = [];
  let shouldStop = false;

  const tryModel = async model => {
    triedModels.add(model);
    const provider = { name: 'Gemini', model, apiKey };
    for (let attempt = 0; attempt <= GEMINI_RETRIES; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 5000) {
        errors.push(`${provider.name} (${model}): hết thời gian chờ AI.`);
        shouldStop = true;
        return null;
      }
      try {
        const parsed = extractJsonObject(await callAiProvider(provider, prompt, remainingMs));
        return { parsed, provider };
      } catch (error) {
        const label = `${provider.name} (${model})` + (attempt > 0 ? ` lần ${attempt + 1}` : '');
        errors.push(`${label}: ${error.message}`);
        if (error.status === 404) {
          unavailableGeminiModels.add(model);
          return null;
        }
        // Sai key, thiếu quyền, request không hợp lệ: đổi model hay thử lại cũng không giúp được
        if ([400, 401, 403].includes(error.status)) {
          shouldStop = true;
          return null;
        }
        if (!isTransientGeminiError(error)) return null;
        if (attempt < GEMINI_RETRIES) {
          const delayMs = Math.min(1500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 500);
          console.warn(`[gemini] ${model} lỗi tạm thời (${error.status || 'mạng'}), thử lại sau ${delayMs}ms`);
          await wait(Math.min(delayMs, Math.max(0, deadline - Date.now() - 5000)));
        }
      }
    }
    return null;
  };

  for (const model of getGeminiModels().filter(name => !unavailableGeminiModels.has(name))) {
    const result = await tryModel(model);
    if (result) return { ...result, errors };
    if (shouldStop) return { parsed: null, provider: null, errors };
  }

  if (GEMINI_MAX_FALLBACK_MODELS > 0) {
    try {
      const fallbackModels = rankFallbackModels(await listGeminiModels(apiKey))
        .filter(model => !triedModels.has(model))
        .slice(0, GEMINI_MAX_FALLBACK_MODELS);
      for (const model of fallbackModels) {
        console.warn(`[gemini] Chuyển sang model dự phòng ${model}.`);
        const result = await tryModel(model);
        if (result) return { ...result, errors };
        if (shouldStop) break;
      }
    } catch (error) {
      errors.push('Tự tìm model Gemini dự phòng: ' + error.message);
    }
  }

  return { parsed: null, provider: null, errors };
}

function getGeminiTimeoutMs() {
  const timeout = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 60000;
}

function getGeminiMaxOutputTokens() {
  const maxTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
  return Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096;
}

function removeTrailingCommas(value = '') {
  return String(value || '').replace(/,\s*([}\]])/g, '$1');
}

function extractJsonObject(text = '') {
  const cleanText = String(text || '').replace(/```json|```/gi, '').trim();
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('AI không trả về JSON hợp lệ. Nội dung nhận được: ' + cleanText.slice(0, 500));
  }
  const candidate = cleanText.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    try {
      return JSON.parse(removeTrailingCommas(candidate));
    } catch (repairError) {
      throw new Error('AI không trả về JSON hợp lệ. Nội dung nhận được: ' + cleanText.slice(0, 500));
    }
  }
}

function normalizeAiAnswers(rawAnswers = [], questions = []) {
  const bySlot = new Map(questions.map(question => [Number(question.slot), question]));
  const byId = new Map(questions.filter(question => question.id !== null).map(question => [String(question.id), question]));

  return rawAnswers.map((answer, index) => {
    const answerSlot = Number(answer.slot || 0);
    const questionById = answer.questionId !== undefined && answer.questionId !== null ? byId.get(String(answer.questionId)) : null;
    const questionBySlot = answerSlot ? bySlot.get(answerSlot) : null;
    const question = questionById || questionBySlot || questions[index] || {};
    const matchedAnswer = question.answers?.find(option =>
      String(option.id) === String(answer.answerId || '') ||
      String(option.label).toLowerCase() === String(answer.answerLabel || '').toLowerCase() ||
      option.text === answer.answerText
    );

    return {
      slot: question.slot || answerSlot || index + 1,
      questionId: question.id || answer.questionId || null,
      questionText: question.questiontext || '',
      questionHtml: question.questionHtml || '',
      source: 'ai',
      answerLabel: answer.answerLabel || matchedAnswer?.label || '',
      answerId: answer.answerId || matchedAnswer?.id || null,
      answerText: answer.answerText || matchedAnswer?.text || '',
      confidence: Number(answer.confidence) || null,
      explanation: String(answer.explanation || '').trim()
    };
  });
}

async function callGemini(provider, prompt, maxTimeoutMs = Infinity) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(getGeminiTimeoutMs(), maxTimeoutMs));
  const timeoutId = setTimeout(() => controller.abort('Gemini quá thời gian phản hồi'), timeoutMs);
  let response;
  try {
    // API key gửi qua header thay vì query string để không lọt vào log của proxy
    response = await fetch(`${GEMINI_API_BASE_URL}/models/${encodeURIComponent(provider.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          maxOutputTokens: getGeminiMaxOutputTokens()
        }
      }),
      signal: controller.signal
    });
  } catch (error) {
    throw Object.assign(
      new Error('không phản hồi sau ' + timeoutMs + 'ms: ' + (error.message || 'timeout')),
      { transient: true }
    );
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message || JSON.stringify(data);
    throw Object.assign(new Error(`API lỗi ${response.status}: ${detail}`), { status: response.status });
  }
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
}

async function callAiProvider(provider, prompt, maxTimeoutMs) {
  return callGemini(provider, prompt, maxTimeoutMs);
}

export async function solveAttemptQuestions(payload = {}) {
  const rawQuestions = Array.isArray(payload.questions)
    ? payload.questions.filter(question => question && typeof question === 'object')
    : [];
  if (rawQuestions.length > MAX_SOLVE_QUESTIONS) {
    throw httpError(400, `Mỗi lần chỉ giải tối đa ${MAX_SOLVE_QUESTIONS} câu hỏi.`);
  }
  const hasOversizedQuestion = rawQuestions.some(question => exceedsQuestionTextLimit(
    question.questiontext,
    question.content,
    ...(Array.isArray(question.answertext) ? question.answertext.flatMap(answer => [answer?.answer, answer?.text, answer?.question]) : [])
  ));
  if (hasOversizedQuestion) {
    throw httpError(400, `Nội dung câu hỏi quá dài (tối đa ${MAX_QUESTION_TEXT_CHARS} ký tự, không tính ảnh).`);
  }
  const questions = rawQuestions.map(normalizeQuestion).filter(question => question.questiontext && question.answers.length > 0);
  if (questions.length === 0) throw httpError(400, 'Không có câu hỏi trắc nghiệm hợp lệ để AI trả lời.');

  const subjectScope = await resolveSubjectScope(payload);
  const { matchedAnswers, unansweredQuestions } = await findStoredAnswers(questions, subjectScope);
  const unavailableAnswers = unansweredQuestions
    .filter(question => question.audioKeys.length > 0)
    .map(createUnavailableAudioAnswer);
  const aiQuestions = unansweredQuestions.filter(question => question.audioKeys.length === 0);
  let aiAnswers = [];
  let usedProvider = null;
  const buildResult = (extra = {}) => ({
    totalQuestions: questions.length,
    databaseCount: matchedAnswers.length,
    aiCount: aiAnswers.length,
    unavailableCount: unavailableAnswers.length,
    provider: usedProvider?.name || '',
    model: usedProvider?.model || '',
    subjectScope: { type: subjectScope.type, subjectName: subjectScope.subjectName },
    answers: [...matchedAnswers, ...unavailableAnswers, ...aiAnswers].sort((a, b) => Number(a.slot) - Number(b.slot)),
    ...extra
  });
  const hasOtherAnswers = matchedAnswers.length > 0 || unavailableAnswers.length > 0;

  if (aiQuestions.length > 0) {
    if (!getGeminiApiKey()) {
      if (hasOtherAnswers) return buildResult();
      throw httpError(503, 'Backend chưa cấu hình GEMINI_API_KEY. Hãy thêm Gemini API key vào biến môi trường.');
    }

    const { parsed, provider, errors } = await askGemini(buildPrompt(aiQuestions));
    if (!parsed) {
      if (hasOtherAnswers) {
        return buildResult({ aiError: `AI lỗi với ${aiQuestions.length} câu chưa có trong hệ thống. ${errors.join(' | ')}` });
      }
      throw httpError(502, `Tất cả model AI đều lỗi. ${errors.join(' | ')}`);
    }
    usedProvider = provider;
    aiAnswers = normalizeAiAnswers(Array.isArray(parsed.answers) ? parsed.answers : [], aiQuestions);
  }

  return buildResult();
}



