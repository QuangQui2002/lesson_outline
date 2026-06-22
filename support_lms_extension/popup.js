function setPopupStatus(message, type = 'info') {
  const status = document.querySelector('#popupStatus');
  status.dataset.type = type;
  status.querySelector('span:last-child').textContent = message;
}

function getPageType(url = '') {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    if (parsedUrl.hostname !== 'lms-tvu.onschool.edu.vn') return 'other';
    if (/^\/course\/\d+\/?$/.test(pathname) || /^\/course\/\d+\/video\/\d+\/?$/.test(pathname)) return 'video';
    if (/\/attempt\/\d+\/review\/?$/.test(pathname)) return 'review';
    if (/\/attempt\/\d+\/?$/.test(pathname)) return 'attempt';
    return 'lms';
  } catch (error) {
    return 'other';
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendActionToActiveTab(type, successMessage) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setPopupStatus('Không tìm thấy tab hiện tại.', 'error');
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type });
    if (!response?.ok) throw new Error(response?.message || 'Không chạy được chức năng trên trang này.');
    setPopupStatus(successMessage, 'success');
  } catch (error) {
    setPopupStatus('Hãy tải lại trang LMS rồi thử lại. ' + error.message, 'error');
  }
}

function setupPageActions(tab) {
  const pageType = getPageType(tab?.url || '');
  const saveVideos = document.querySelector('#saveVideos');
  const importQuestions = document.querySelector('#importQuestions');
  const solveAttempt = document.querySelector('#solveAttempt');
  const currentPageType = document.querySelector('#currentPageType');

  saveVideos.disabled = pageType !== 'video';
  importQuestions.disabled = pageType !== 'review';
  solveAttempt.disabled = pageType !== 'attempt';

  if (pageType === 'video') currentPageType.textContent = 'Trang môn học/video LMS: có thể lưu video.';
  else if (pageType === 'review') currentPageType.textContent = 'Trang review: có thể lấy câu hỏi.';
  else if (pageType === 'attempt') currentPageType.textContent = 'Trang attempt: có thể nhờ AI trả lời.';
  else if (pageType === 'lms') currentPageType.textContent = 'Trang LMS: chưa đúng trang chức năng.';
  else currentPageType.textContent = 'Không phải trang LMS TVU.';

  saveVideos.addEventListener('click', () => sendActionToActiveTab('RUN_SAVE_COURSE_LESSONS', 'Đã gửi lệnh lưu video sang trang LMS.'));
  importQuestions.addEventListener('click', () => sendActionToActiveTab('RUN_IMPORT_REVIEW_QUESTIONS', 'Đã gửi lệnh lấy câu hỏi sang trang LMS.'));
  solveAttempt.addEventListener('click', () => sendActionToActiveTab('RUN_SOLVE_ATTEMPT_QUESTIONS', 'Đã gửi lệnh nhờ AI trả lời attempt.'));
}

async function init() {
  setPopupStatus('Dùng Gemini backend cho AI đáp án.', 'info');
  setupPageActions(await getActiveTab());
}

init();

