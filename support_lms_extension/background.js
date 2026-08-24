const SERVER_BACKEND_URL = 'https://lesson-outline-h788.onrender.com/api';

const LMS_ORIGIN = 'https://lms-tvu.onschool.edu.vn';
const REVIEW_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const REVIEW_IMAGES_TOTAL_MAX_BYTES = 6 * 1024 * 1024;
const REVIEW_IMPORT_BODY_MAX_BYTES = 9 * 1024 * 1024;
const fullAnswerCache = new Map();
const AUDIO_URL_PATTERN = /https:\/\/[^\s<>'"]+?\.(?:mp3|m4a|aac|ogg|oga|wav|webm)(?:\?[^\s<>'"]*)?/gi;

function normalizeBackendUrl(url = '') {
  return String(url || SERVER_BACKEND_URL).trim().replace(/\/+$/, '');
}

function getBackendUrls() {
  return [SERVER_BACKEND_URL].map(normalizeBackendUrl);
}

async function requestJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('Quá thời gian chờ server'), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'Quá thời gian chờ server sau ' + Math.round(timeoutMs / 1000) + ' giây.'
      : error.message || 'Không kết nối được server.';
    throw new Error('Không kết nối được ' + url + ': ' + message);
  } finally {
    clearTimeout(timeoutId);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error('Phản hồi không phải JSON từ ' + url);
  }
  if (!response.ok || data?.success === false) {
    const requestError = new Error(data?.message || 'Request lỗi ' + response.status);
    requestError.status = response.status;
    requestError.responseData = data;
    throw requestError;
  }
  return data;
}

async function requestServerBackendJson(path, options = {}, timeoutMs = 180000) {
  return requestJson(normalizeBackendUrl(SERVER_BACKEND_URL) + path, options, timeoutMs);
}

async function requestBackendJson(path, options = {}, backendUrl = '') {
  if (backendUrl) return requestJson(normalizeBackendUrl(backendUrl) + path, options);

  let lastError = null;
  for (const candidateUrl of getBackendUrls()) {
    try {
      return await requestJson(candidateUrl + path, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Không kết nối được server backend.');
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
      const number = code[0].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : ' ';
    });
}

function stripHtml(value = '') {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeAudioKey(value = '') {
  const decoded = decodeHtmlEntities(value).trim();
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
    const source = getTagAttribute(openingTag, 'src');
    if (source) keys.push(source);
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

function removeAudioMarkup(value = '') {
  return removeAudioUrls(String(value || '')
    .replace(/<audio\b[\s\S]*?<\/audio>/gi, ' ')
    .replace(/<a\b[^>]*href=["'][^"']+\.(?:mp3|m4a|aac|ogg|oga|wav|webm)(?:\?[^"']*)?["'][^>]*>[\s\S]*?<\/a>/gi, ' '));
}

function extractQuestionStem(value = '') {
  const text = decodeHtmlEntities(removeAudioMarkup(value))
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const stemLines = [];
  for (const line of lines) {
    if (/^\d+\s*[.)]\s+/i.test(line)) break;
    if (/^[A-Z]\s*[.)]\s+/i.test(line)) break;
    stemLines.push(line);
  }
  return (stemLines.join(' ') || stripHtml(removeAudioMarkup(value))).replace(/\s+/g, ' ').trim();
}

function storedAnswerToText(value = '') {
  return decodeHtmlEntities(String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/ *\r?\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeQuestionText(value = '') {
  return extractQuestionStem(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/^\s*cau\s*\d+\s*[:.\-) ]*/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function extractStoredQuestionText(content = '') {
  const lines = decodeHtmlEntities(content)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const questionLines = [];
  for (const line of lines) {
    if (/^[A-Z]\s*[.)]\s+/i.test(line)) break;
    if (/^(\u0110\u00e1p \u00e1n \u0111\u00fang l\u00e0|Dap an dung la|V\u00ec|Vi|Tham kh\u1ea3o|Tham khao)\s*:/i.test(line)) break;
    questionLines.push(line);
  }
  return removeAudioUrls(questionLines.join(' ') || stripHtml(content)).replace(/\s+/g, ' ').trim();
}

function createSearchQueries(questionText = '') {
  const text = extractQuestionStem(questionText)
    .replace(/^\s*C(?:\u00e2|a)u\s*\d+\s*[:.\-) ]*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lengths = [220, 140, 80];
  return [...new Set(lengths.map(length => {
    if (text.length <= length) return text;
    const chunk = text.slice(0, length + 1);
    return chunk.slice(0, chunk.lastIndexOf(' ')).trim();
  }).filter(query => query.length >= 12))];
}

function scoreStoredQuestion(answer = {}, question = {}) {
  const answerContent = answer.questionHtml || answer.questionText || '';
  const audioKeys = extractAudioKeys(answerContent);
  if (!hasSameAudioKeys(answerContent, question.content || '')) return 0;

  const target = normalizeQuestionText(answerContent);
  const candidate = normalizeQuestionText(extractStoredQuestionText(question.content || ''));
  if (!target || !candidate) return 0;

  let score = 0;
  if (target === candidate) score = 2;
  else if (target.includes(candidate) || candidate.includes(target)) {
    score = 1 + Math.min(target.length, candidate.length) / Math.max(target.length, candidate.length);
  } else {
    let matchingPrefixLength = 0;
    const maxPrefixLength = Math.min(target.length, candidate.length);
    while (matchingPrefixLength < maxPrefixLength && target[matchingPrefixLength] === candidate[matchingPrefixLength]) {
      matchingPrefixLength += 1;
    }
    score = matchingPrefixLength / Math.max(target.length, candidate.length);
  }

  if (audioKeys.length > 0 && score < 1.85) return 0;
  if (audioKeys.length === 0 && score < 0.5) return 0;
  const sameSourceId = answer.questionId !== null && answer.questionId !== undefined
    && question.sourceId !== null && question.sourceId !== undefined
    && String(answer.questionId) === String(question.sourceId);
  return score + (sameSourceId ? 0.02 : 0);
}

async function fetchFullStoredAnswer(answer = {}) {
  const normalizedQuestion = normalizeQuestionText(answer.questionHtml || answer.questionText || '');
  const audioKey = extractAudioKeys(answer.questionHtml || answer.questionText || '').join('|');
  const cacheKey = String(answer.questionId || '') + ':' + normalizedQuestion + ':' + audioKey;
  if (!normalizedQuestion) return null;
  if (fullAnswerCache.has(cacheKey)) return fullAnswerCache.get(cacheKey);

  const lookupPromise = (async () => {
    for (const query of createSearchQueries(answer.questionText || answer.questionHtml || '')) {
      const response = await requestServerBackendJson('/questions?search=' + encodeURIComponent(query) + '&limit=20', {}, 30000);
      const questions = Array.isArray(response?.data) ? response.data : [];
      const bestMatch = questions
        .map(question => ({ question, score: scoreStoredQuestion(answer, question) }))
        .sort((first, second) => second.score - first.score)[0];
      if (bestMatch?.score >= 0.5 && bestMatch.question.answer) {
        return {
          html: String(bestMatch.question.answer),
          text: storedAnswerToText(bestMatch.question.answer)
        };
      }
    }
    return null;
  })().catch(() => null);

  fullAnswerCache.set(cacheKey, lookupPromise);
  return lookupPromise;
}

async function enrichStoredAnswers(response = {}) {
  const result = response?.data;
  if (!result || !Array.isArray(result.answers)) return response;
  const answers = await Promise.all(result.answers.map(async answer => {
    if (answer.source === 'database' && answer.fullAnswerHtml) return answer;
    const storedAnswer = await fetchFullStoredAnswer(answer);
    if (!storedAnswer && extractAudioKeys(answer.questionHtml || answer.questionText || '').length > 0) {
      return {
        ...answer,
        source: 'unavailable',
        answerLabel: '',
        answerId: null,
        answerText: 'Chưa có thông tin trong Lesson Outline.',
        fullAnswerHtml: '',
        fullAnswerText: '',
        confidence: null,
        explanation: ''
      };
    }
    if (!storedAnswer) return answer;
    return {
      ...answer,
      source: 'database',
      fullAnswerHtml: storedAnswer.html,
      fullAnswerText: storedAnswer.text,
      confidence: answer.source === 'database' ? answer.confidence : 1,
      explanation: 'T\u00ecm th\u1ea5y c\u00e2u h\u1ecfi trong ng\u00e2n h\u00e0ng c\u00e2u h\u1ecfi theo m\u00e3 ho\u1eb7c n\u1ed9i dung.'
    };
  }));
  return {
    ...response,
    data: {
      ...result,
      databaseCount: answers.filter(answer => answer.source === 'database').length,
      aiCount: answers.filter(answer => answer.source === 'ai').length,
      unavailableCount: answers.filter(answer => answer.source === 'unavailable').length,
      answers
    }
  };
}

async function findOrCreateSubject(courseName) {
  const normalizedName = String(courseName || 'Môn học LMS').trim();

  let lastError = null;
  for (const backendUrl of getBackendUrls()) {
    try {
      const subjectsResponse = await requestBackendJson('/subjects', {}, backendUrl);
      const subjects = Array.isArray(subjectsResponse.data) ? subjectsResponse.data : [];
      const existing = subjects.find(subject => String(subject.name || '').trim().toLowerCase() === normalizedName.toLowerCase());
      if (existing) return { subject: existing, backendUrl };

      const created = await requestBackendJson('/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName || 'Môn học LMS' })
      }, backendUrl);
      return { subject: created.data, backendUrl };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Không kết nối được server backend.');
}

async function solveAttemptQuestions(attemptJson) {
  const payload = attemptJson?.data || attemptJson || {};
  const response = await requestServerBackendJson('/attempt-answers/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return enrichStoredAnswers(response);
}
function compactReviewPayload(reviewJson = {}) {
  const payload = reviewJson?.data || reviewJson || {};
  const questions = Array.isArray(payload.questions) ? payload.questions.map(question => ({
    id: question.id || null,
    slot: question.slot || null,
    type: question.type || '',
    questiontext: question.questiontext || '',
    rightanswer: question.rightanswer || '',
    answertext: Array.isArray(question.answertext) ? question.answertext.map(answer => ({
      id: answer.id || null,
      question: answer.question || '',
      answer: answer.answer || answer.text || '',
      text: answer.text || '',
      fraction: answer.fraction ?? null,
      iscorrect: Boolean(answer.iscorrect),
      userselected: Boolean(answer.userselected),
      type: answer.type || ''
    })) : [],
    generalfeedback: question.generalfeedback || ''
  })) : [];

  return {
    subjectId: payload.subjectId,
    course: payload.course || {},
    quiz: payload.quiz || {},
    quizName: payload.quizName || payload.quiz?.name || 'Khác',
    questions
  };
}

function extractHtmlImageSources(value = '') {
  const sources = [];
  String(value || '').replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, source) => {
    sources.push(source);
    return match;
  });
  return [...new Set(sources.filter(source => source && !source.startsWith('data:image/')))];
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function fetchReviewImageToken(source, state) {
  const imageUrl = new URL(source, LMS_ORIGIN).toString();
  if (!imageUrl.startsWith('https://')) throw new Error('Chỉ hỗ trợ ảnh HTTPS.');
  if (!state.cache.has(imageUrl)) {
    const token = '__QUESTION_IMAGE_' + state.nextImageId + '__';
    state.nextImageId += 1;
    state.cache.set(imageUrl, (async () => {
      const response = await fetch(imageUrl, { credentials: 'include', cache: 'force-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!contentType.startsWith('image/')) throw new Error('URL không trả về ảnh.');
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > REVIEW_IMAGE_MAX_BYTES) throw new Error('Ảnh vượt giới hạn 4 MB.');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > REVIEW_IMAGE_MAX_BYTES) throw new Error('Ảnh vượt giới hạn 4 MB.');
      if (state.totalBytes + buffer.byteLength > REVIEW_IMAGES_TOTAL_MAX_BYTES) {
        throw new Error('Tổng ảnh vượt giới hạn 6 MB.');
      }
      state.totalBytes += buffer.byteLength;
      state.images[token] = 'data:' + contentType + ';base64,' + arrayBufferToBase64(buffer);
      return token;
    })());
  }
  return state.cache.get(imageUrl);
}

function replaceHtmlImageSource(value, source, replacement) {
  const imageKey = encodeURIComponent(new URL(source, LMS_ORIGIN).toString());
  return String(value || '').replace(/<img\b[^>]*>/gi, tag => {
    const sourceMatch = tag.match(/\ssrc=["']([^"']*)["']/i);
    if (!sourceMatch || sourceMatch[1] !== source) return tag;
    let updatedTag = tag;
    if (!/\sdata-image-key=["'][^"']*["']/i.test(updatedTag)) {
      updatedTag = updatedTag.replace(/^<img\b/i, '<img data-image-key="' + imageKey + '"');
    }
    return updatedTag.replace(source, replacement);
  });
}

async function hydrateHtmlImages(value, state) {
  let hydrated = String(value || '');
  const sources = extractHtmlImageSources(hydrated);
  const results = await Promise.all(sources.map(async source => {
    try {
      return { source, replacement: await fetchReviewImageToken(source, state) };
    } catch (error) {
      state.warnings.push({ source, message: error.message });
      return { source, replacement: source };
    }
  }));
  for (const result of results) hydrated = replaceHtmlImageSource(hydrated, result.source, result.replacement);
  return hydrated;
}

async function hydrateReviewPayloadImages(payload) {
  const state = { cache: new Map(), totalBytes: 0, warnings: [], images: {}, nextImageId: 0 };
  const questions = [];
  for (const question of payload.questions || []) {
    questions.push({
      ...question,
      questiontext: await hydrateHtmlImages(question.questiontext, state),
      generalfeedback: await hydrateHtmlImages(question.generalfeedback, state),
      answertext: await Promise.all((question.answertext || []).map(async answer => ({
        ...answer,
        question: await hydrateHtmlImages(answer.question, state),
        answer: await hydrateHtmlImages(answer.answer, state),
        text: await hydrateHtmlImages(answer.text, state)
      })))
    });
  }
  return { ...payload, questions, images: state.images, imageHydrationWarnings: state.warnings };
}

async function importAttemptQuestions(reviewJson) {
  const payload = await hydrateReviewPayloadImages(compactReviewPayload(reviewJson));
  const course = payload.course || {};
  const quiz = payload.quiz || {};
  const courseName = course.name || course.fullname || ('Môn học ' + (course.id || '')).trim();
  const { subject, backendUrl } = await findOrCreateSubject(courseName || 'Môn học LMS');
  const requestBody = JSON.stringify({ ...payload, subjectId: subject.id, quizName: quiz.name || payload.quizName || 'Khác' });
  if (new TextEncoder().encode(requestBody).byteLength > REVIEW_IMPORT_BODY_MAX_BYTES) {
    throw new Error('Dữ liệu import vượt 9 MB. Hãy import ít câu hỏi hoặc ảnh nhỏ hơn.');
  }
  let response;
  try {
    response = await requestJson(normalizeBackendUrl(backendUrl) + '/questions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    }, 180000);
  } catch (error) {
    const skipped = error.responseData?.skipped;
    if (error.status !== 400 || !Array.isArray(skipped)) throw error;
    response = {
      success: true,
      data: {
        importedCount: 0,
        skippedCount: skipped.length,
        skipped,
        questions: [],
        imageWarnings: []
      }
    };
  }
  if (payload.imageHydrationWarnings.length > 0 && response.data) {
    response.data.imageWarnings = [
      ...(response.data.imageWarnings || []),
      ...payload.imageHydrationWarnings.map(warning => ({ ...warning, phase: 'extension' }))
    ];
  }
  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SOLVE_ATTEMPT_QUESTIONS') {
    solveAttemptQuestions(message.attemptJson)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'IMPORT_ATTEMPT_REVIEW_QUESTIONS') {
    importAttemptQuestions(message.reviewJson)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});










