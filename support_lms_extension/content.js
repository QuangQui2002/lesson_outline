function getCourseIdFromUrl() {
  const match = location.pathname.match(/\/course\/(\d+)/);
  return match ? match[1] : '';
}

function getAttemptIdFromUrl() {
  const match = location.pathname.match(/\/attempt\/(\d+)\/review/);
  return match ? match[1] : '';
}

function getLiveAttemptIdFromUrl() {
  const match = location.pathname.match(/\/attempt\/(\d+)(?:\/)?$/);
  return match ? match[1] : '';
}

function isAttemptReviewPage() {
  return Boolean(getAttemptIdFromUrl());
}

function isLiveAttemptPage() {
  return Boolean(getLiveAttemptIdFromUrl());
}

function isLessonVideoPage() {
  return /^\/course\/\d+\/?$/.test(location.pathname) || /^\/course\/\d+\/video\/\d+\/?$/.test(location.pathname);
}

function isLmsVideoDetailPage() {
  return /^\/course\/\d+\/video\/\d+\/?$/.test(location.pathname);
}

function setStatus(text, type = 'info') {
  const status = document.querySelector('#lesson-video-status');
  if (!status) return;
  status.textContent = text;
  status.dataset.type = type;
}

function hideFloatingWidget() {
  const widget = document.querySelector('#lesson-video-widget');
  if (widget) widget.style.display = 'none';
}

function showFloatingWidget() {
  const widget = document.querySelector('#lesson-video-widget');
  if (widget) widget.style.display = '';
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c ' + url + ' (' + response.status + ')');
  return response.json();
}

function uniqueUrls(urls = []) {
  return Array.from(new Set(urls.filter(Boolean)));
}

function getExternalUrls(module = {}) {
  const rawUrls = module.externalurl || module.externalUrl || module.externalUrls || [];
  return uniqueUrls((Array.isArray(rawUrls) ? rawUrls : [rawUrls]).filter(Boolean));
}
function getModules(courseJson) {
  const course = courseJson?.data || courseJson || {};
  const sections = Array.isArray(course.sections) ? course.sections : [];
  return sections.flatMap(section => (Array.isArray(section.modules) ? section.modules : [])
    .filter(module => String(module.moduletype || '').trim() === 'L')
    .filter(module => !['label'].includes(String(module.type || module.modname || '').trim().toLowerCase()))
    .map(module => ({ section, module })));
}

async function enrichModule(courseId, module) {
  const moduleType = module.type || module.modname || 'hvp';
  const moduleId = module.id || module.cmid;
  if (!moduleId) return module;

  if (String(moduleType || '').trim().toLowerCase() === 'label') {
    return {
      ...module,
      page_url: 'https://lms-tvu.onschool.edu.vn/course/' + courseId + '/video/' + moduleId
    };
  }

  try {
    const detail = await fetchJson('https://lms-tvu.onschool.edu.vn/api/modules/' + moduleType + '/' + moduleId);
    const data = detail?.data || detail || {};
    return {
      ...module,
      ...data,
      id: module.id || data.id || moduleId,
      cmid: module.cmid || data.cmid,
      name: module.name || data.name,
      externalurl: data.externalurl || module.externalurl || [],
      page_url: 'https://lms-tvu.onschool.edu.vn/course/' + courseId + '/video/' + moduleId
    };
  } catch (error) {
    return {
      ...module,
      page_url: 'https://lms-tvu.onschool.edu.vn/course/' + courseId + '/video/' + moduleId
    };
  }
}

async function collectCourseLessons() {
  const courseId = getCourseIdFromUrl();
  if (!courseId) throw new Error('Kh\u00f4ng t\u00ecm th\u1ea5y m\u00e3 m\u00f4n h\u1ecdc tr\u00ean URL.');

  setStatus('\u0110ang t\u1ea3i danh s\u00e1ch b\u00e0i h\u1ecdc...', 'loading');
  const courseJson = await fetchJson('https://lms-tvu.onschool.edu.vn/api/courses/' + courseId);
  const course = courseJson?.data || courseJson || {};
  const sections = Array.isArray(course.sections) ? course.sections : [];
  const theoryModules = getModules(courseJson);

  setStatus('Đang lấy link bài học (' + theoryModules.length + ' bài)...', 'loading');
  for (let index = 0; index < theoryModules.length; index += 1) {
    const item = theoryModules[index];
    setStatus('Đang xử lý bài học ' + (index + 1) + '/' + theoryModules.length + ': ' + (item.module.name || item.module.id), 'loading');
    item.module = await enrichModule(courseId, item.module);
  }
  const enrichedSections = sections.map(section => ({
    ...section,
    modules: (Array.isArray(section.modules) ? section.modules : []).map(module => {
      const found = theoryModules.find(item => item.module.id === module.id || item.module.cmid === module.cmid);
      return found ? found.module : module;
    })
  }));

  return { success: true, data: { ...course, sections: enrichedSections } };
}

async function saveCourseLessons() {
  try {
    setStatus('\u0110ang qu\u00e9t d\u1eef li\u1ec7u LMS...', 'loading');
    const courseJson = await collectCourseLessons();
    setStatus('\u0110ang l\u01b0u v\u00e0o h\u1ec7 th\u1ed1ng...', 'loading');
    const response = await chrome.runtime.sendMessage({ type: 'IMPORT_COURSE_LESSON_VIDEOS', courseJson });
    if (!response?.ok) throw new Error(response?.message || 'Kh\u00f4ng l\u01b0u \u0111\u01b0\u1ee3c b\u00e0i h\u1ecdc video.');
    const result = response.data?.data || {};
    setStatus('\u0110\u00e3 l\u01b0u ' + (result.importedCount || 0) + '/' + (result.totalCount || 0) + ' b\u00e0i h\u1ecdc video.', 'success');
  } catch (error) {
    setStatus('L\u1ed7i: ' + error.message, 'error');
  }
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAiAnswerPanel(answers = []) {
  let panel = document.querySelector('#lms-ai-answer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lms-ai-answer-panel';
    document.body.appendChild(panel);
  }

  const answerItems = answers.length > 0
    ? answers.map(answer => `
      <div class="lms-ai-answer-item">
        <strong>Câu ${escapeHtml(answer.slot)}: ${escapeHtml(answer.answerLabel || '')}</strong>
        <p>${escapeHtml(answer.answerText || 'Không có nội dung đáp án.')}</p>
        ${answer.explanation ? `<small>${escapeHtml(answer.explanation)}</small>` : ''}
      </div>
    `).join('')
    : '<p class="lms-ai-answer-empty">AI chưa trả về đáp án.</p>';

  panel.innerHTML = `
    <div class="lms-ai-answer-header">
      <span>Đáp án AI</span>
      <button id="lms-ai-answer-close" type="button" title="Đóng">×</button>
    </div>
    <div class="lms-ai-answer-body">${answerItems}</div>
  `;
  panel.querySelector('#lms-ai-answer-close').addEventListener('click', () => panel.remove());
}


function renderAiStatusPanel(message = 'Đang xử lý...', type = 'loading') {
  let panel = document.querySelector('#lms-ai-answer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lms-ai-answer-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="lms-ai-answer-header">
      <span>Đáp án AI</span>
      <button id="lms-ai-answer-close" type="button" title="Đóng">×</button>
    </div>
    <div class="lms-ai-answer-body">
      <p class="lms-ai-answer-empty lms-ai-answer-${type}">${escapeHtml(message)}</p>
    </div>
  `;
  panel.querySelector('#lms-ai-answer-close').addEventListener('click', () => panel.remove());
}
async function collectLiveAttemptQuestions() {
  const attemptId = getLiveAttemptIdFromUrl();
  if (!attemptId) throw new Error('Không tìm thấy mã attempt trên URL.');

  setStatus('Đang tải câu hỏi attempt trang 1...', 'loading');
  const firstPage = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '?page=1');
  const payload = firstPage?.data || firstPage || {};
  const totalPage = Number(payload.totalpage || firstPage.totalpage || 1) || 1;
  const questions = [...(payload.questions || firstPage.questions || [])];

  for (let page = 2; page <= totalPage; page += 1) {
    setStatus('Đang tải câu hỏi attempt trang ' + page + '/' + totalPage + '...', 'loading');
    const pageJson = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '?page=' + page);
    const pagePayload = pageJson?.data || pageJson || {};
    questions.push(...(pagePayload.questions || pageJson.questions || []));
  }

  return { ...payload, questions, totalquestions: questions.length };
}

async function solveLiveAttemptQuestions() {
  renderAiStatusPanel('Đang tải câu hỏi từ LMS...', 'loading');
  try {
    const attemptJson = await collectLiveAttemptQuestions();
    renderAiStatusPanel('Đang nhờ AI trả lời ' + (attemptJson.questions?.length || 0) + ' câu hỏi...', 'loading');
    setStatus('Đang nhờ AI trả lời ' + (attemptJson.questions?.length || 0) + ' câu hỏi...', 'loading');
    const response = await chrome.runtime.sendMessage({ type: 'SOLVE_ATTEMPT_QUESTIONS', attemptJson });
    if (!response?.ok) throw new Error(response?.message || 'Không lấy được đáp án AI.');
    const answers = response.data?.data?.answers || [];
    renderAiAnswerPanel(answers);
    setStatus('Đã nhận ' + answers.length + ' đáp án AI.', 'success');
  } catch (error) {
    renderAiStatusPanel('Lỗi: ' + error.message, 'error');
    setStatus('Lỗi: ' + error.message, 'error');
  }
}
async function collectAttemptReviewQuestions() {
  const attemptId = getAttemptIdFromUrl();
  if (!attemptId) throw new Error('Kh\u00f4ng t\u00ecm th\u1ea5y m\u00e3 attempt tr\u00ean URL.');

  setStatus('\u0110ang t\u1ea3i c\u00e2u h\u1ecfi review trang 1...', 'loading');
  const firstPage = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '/review?page=1');
  const payload = firstPage?.data || firstPage || {};
  const totalPage = Number(payload.totalpage || firstPage.totalpage || 1) || 1;
  const questions = [...(payload.questions || firstPage.questions || [])];

  for (let page = 2; page <= totalPage; page += 1) {
    setStatus('\u0110ang t\u1ea3i c\u00e2u h\u1ecfi review trang ' + page + '/' + totalPage + '...', 'loading');
    const pageJson = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '/review?page=' + page);
    const pagePayload = pageJson?.data || pageJson || {};
    questions.push(...(pagePayload.questions || pageJson.questions || []));
  }

  return { ...payload, questions, totalquestions: questions.length };
}

async function saveAttemptReviewQuestions() {
  try {
    const reviewJson = await collectAttemptReviewQuestions();
    setStatus('\u0110ang import c\u00e2u h\u1ecfi v\u00e0o h\u1ec7 th\u1ed1ng...', 'loading');
    const response = await chrome.runtime.sendMessage({ type: 'IMPORT_ATTEMPT_REVIEW_QUESTIONS', reviewJson });
    if (!response?.ok) throw new Error(response?.message || 'Kh\u00f4ng import \u0111\u01b0\u1ee3c c\u00e2u h\u1ecfi review.');
    const result = response.data?.data || {};
    setStatus('\u0110\u00e3 import ' + (result.importedCount || 0) + '/' + (result.totalCount || 0) + ' c\u00e2u h\u1ecfi. B\u1ecf qua ' + (result.skippedCount || 0) + '.', 'success');
  } catch (error) {
    setStatus('L\u1ed7i: ' + error.message, 'error');
  }
}

function createFloatingButton() {
  const currentWidget = document.querySelector('#lesson-video-widget');
  const reviewPage = isAttemptReviewPage();
  const lessonPage = isLessonVideoPage();
  const liveAttemptPage = isLiveAttemptPage();
  if (!reviewPage && !lessonPage && !liveAttemptPage) {
    if (currentWidget) currentWidget.remove();
    return;
  }

  const widgetType = reviewPage ? 'review' : liveAttemptPage ? 'solve' : 'video';
  if (currentWidget?.dataset.widgetType === widgetType) return;
  if (currentWidget) currentWidget.remove();

  const widget = document.createElement('div');
  widget.id = 'lesson-video-widget';
  widget.dataset.widgetType = widgetType;
  widget.classList.add('lesson-video-widget--mini');
  if (isLmsVideoDetailPage()) widget.classList.add('lesson-video-widget--compact');

  if (reviewPage) {
    widget.innerHTML = '<button id="lesson-video-button" class="lesson-video-button lesson-video-button--question" type="button" title="Import câu hỏi review vào ngân hàng câu hỏi"><span>Lấy câu hỏi</span><small>Review</small></button><div id="lesson-video-status" data-type="info">Sẵn sàng.</div>';
  } else if (liveAttemptPage) {
    widget.innerHTML = '<button id="lesson-video-button" class="lesson-video-button lesson-video-button--answer" type="button" title="Nhờ AI trả lời câu hỏi trong attempt"><span>AI đáp án</span><small>Attempt</small></button><div id="lesson-video-status" data-type="info">Sẵn sàng.</div>';
  } else {
    widget.innerHTML = '<button id="lesson-video-button" class="lesson-video-button lesson-video-button--video" type="button" title="Lưu danh sách bài học video của môn này"><span>Lưu video</span><small>Bài học</small></button><div id="lesson-video-status" data-type="info">Sẵn sàng.</div>';
  }

  document.body.appendChild(widget);
  const handler = reviewPage ? saveAttemptReviewQuestions : liveAttemptPage ? solveLiveAttemptQuestions : saveCourseLessons;
  document.querySelector('#lesson-video-button').addEventListener('click', handler);
}
createFloatingButton();

window.addEventListener('message', event => {
  if (event.source !== window || event.data?.source !== 'lms-tvu-helper-toolbar') return;

  if (event.data.type === 'TOOLBAR_READY') {
    if (event.data.hasAction) hideFloatingWidget();
    else showFloatingWidget();
    return;
  }

  if (event.data.type === 'SAVE_VIDEO') {
    if (isLessonVideoPage()) saveCourseLessons();
    return;
  }

  if (event.data.type === 'IMPORT_QUESTIONS') {
    if (isAttemptReviewPage()) saveAttemptReviewQuestions();
    return;
  }

  if (event.data.type === 'SOLVE_ATTEMPT') {
    if (isLiveAttemptPage()) solveLiveAttemptQuestions();
  }
});

function watchLmsNavigation() {
  let lastUrl = location.href;
  const refreshWidget = () => {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    setTimeout(createFloatingButton, 250);
  };

  ['pushState', 'replaceState'].forEach(methodName => {
    const originalMethod = history[methodName];
    history[methodName] = function (...args) {
      const result = originalMethod.apply(this, args);
      refreshWidget();
      return result;
    };
  });

  window.addEventListener('popstate', refreshWidget);
  setInterval(() => {
    refreshWidget();
    if (!document.querySelector('#lms-video-enhancer-panel')) showFloatingWidget();
  }, 1000);
}

watchLmsNavigation();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RUN_SAVE_COURSE_LESSONS') {
    if (!isLessonVideoPage()) {
      sendResponse({ ok: false, message: 'Trang hiện tại không phải trang môn học/video LMS.' });
      return false;
    }
    saveCourseLessons();
    sendResponse({ ok: true, message: 'Đã bắt đầu lưu bài học video.' });
    return false;
  }

  if (message?.type === 'RUN_SOLVE_ATTEMPT_QUESTIONS') {
    if (!isLiveAttemptPage()) {
      sendResponse({ ok: false, message: 'Trang hiện tại không phải trang attempt đang làm bài.' });
      return false;
    }
    solveLiveAttemptQuestions();
    sendResponse({ ok: true, message: 'Đã bắt đầu nhờ AI trả lời attempt.' });
    return false;
  }

  if (message?.type === 'RUN_IMPORT_REVIEW_QUESTIONS') {
    if (!isAttemptReviewPage()) {
      sendResponse({ ok: false, message: 'Trang hiện tại không phải trang review câu hỏi.' });
      return false;
    }
    saveAttemptReviewQuestions();
    sendResponse({ ok: true, message: 'Đã bắt đầu import câu hỏi review.' });
    return false;
  }

  return false;
});







