const SERVER_BACKEND_URL = 'https://lesson-outline-h788.onrender.com/api';

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
    throw new Error('Không kết nối được ' + url + ': ' + (error.message || 'Quá thời gian chờ server'));
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

async function importCourseLessons(courseJson) {
  const course = courseJson?.data || courseJson || {};
  const courseName = course.fullname || course.name || ('Môn học ' + (course.id || '')).trim();
  const { subject, backendUrl } = await findOrCreateSubject(courseName);
  return requestBackendJson('/lesson-videos/import-course', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId: subject.id, ...courseJson })
  }, backendUrl);
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

async function importAttemptQuestions(reviewJson) {
  const payload = compactReviewPayload(reviewJson);
  const course = payload.course || {};
  const quiz = payload.quiz || {};
  const courseName = course.name || course.fullname || ('Môn học ' + (course.id || '')).trim();
  const { subject, backendUrl } = await findOrCreateSubject(courseName || 'Môn học LMS');
  return requestJson(normalizeBackendUrl(backendUrl) + '/questions/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId: subject.id, quizName: quiz.name || 'Khác', ...payload })
  }, 120000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'IMPORT_COURSE_LESSON_VIDEOS') {
    importCourseLessons(message.courseJson)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }


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









