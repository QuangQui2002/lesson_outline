const LOCAL_BACKEND_URL = 'http://localhost:3000/api';
const SERVER_BACKEND_URL = 'https://lesson-outline.onrender.com/api';

function normalizeBackendUrl(url = '') {
  return String(url || LOCAL_BACKEND_URL).trim().replace(/\/+$/, '');
}

function getBackendUrls() {
  return [LOCAL_BACKEND_URL, SERVER_BACKEND_URL].map(normalizeBackendUrl);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
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
  throw lastError || new Error('Không kết nối được backend local hoặc server.');
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

  throw lastError || new Error('Không kết nối được backend local hoặc server.');
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

async function importAttemptQuestions(reviewJson) {
  const payload = reviewJson?.data || reviewJson || {};
  const course = payload.course || {};
  const quiz = payload.quiz || {};
  const courseName = course.name || course.fullname || ('Môn học ' + (course.id || '')).trim();
  const { subject, backendUrl } = await findOrCreateSubject(courseName || 'Môn học LMS');
  return requestBackendJson('/questions/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId: subject.id, quizName: quiz.name || 'Khác', ...payload })
  }, backendUrl);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'IMPORT_COURSE_LESSON_VIDEOS') {
    importCourseLessons(message.courseJson)
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
