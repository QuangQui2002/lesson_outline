const SERVER_BACKEND_URL = 'https://lesson-outline-h788.onrender.com/api';

const LMS_ORIGIN = 'https://lms-tvu.onschool.edu.vn';
const REVIEW_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const REVIEW_IMAGES_TOTAL_MAX_BYTES = 6 * 1024 * 1024;
const REVIEW_IMPORT_BODY_MAX_BYTES = 9 * 1024 * 1024;

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
  if (!response.ok || data?.success === false) throw new Error(data?.message || 'Request lỗi ' + response.status);
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
  return requestServerBackendJson('/attempt-answers/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
function compactReviewPayload(reviewJson = {}) {
  const payload = reviewJson?.data || reviewJson || {};
  const questions = Array.isArray(payload.questions) ? payload.questions.map(question => ({
    id: question.id || null,
    slot: question.slot || null,
    type: question.type || '',
    questiontext: question.questiontext || '',
    answertext: Array.isArray(question.answertext) ? question.answertext.map(answer => ({
      id: answer.id || null,
      answer: answer.answer || answer.text || '',
      fraction: answer.fraction ?? null,
      iscorrect: Boolean(answer.iscorrect)
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
  for (const result of results) hydrated = hydrated.split(result.source).join(result.replacement);
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
        answer: await hydrateHtmlImages(answer.answer, state)
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
  const response = await requestJson(normalizeBackendUrl(backendUrl) + '/questions/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody
  }, 180000);
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










