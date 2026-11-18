import axios from 'axios';

const apiBaseURL = import.meta.env.VITE_API_BASE_URL;

if (apiBaseURL === undefined) {
  throw new Error('Thiếu biến môi trường VITE_API_BASE_URL.');
}
const apiClient = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// --- Admin key cho các thao tác sửa/xóa (backend trả 401 ADMIN_KEY_REQUIRED nếu thiếu/sai) ---
const ADMIN_KEY_STORAGE_KEY = 'lesson-outline-admin-key';

function readAdminKey() {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
}

function saveAdminKey(value) {
  try {
    if (value) localStorage.setItem(ADMIN_KEY_STORAGE_KEY, value);
    else localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
  } catch (error) {
    // Trình duyệt chặn localStorage: chỉ dùng key cho lần thử lại hiện tại
  }
}

let pendingAdminKey = '';

apiClient.interceptors.request.use(config => {
  const adminKey = pendingAdminKey || readAdminKey();
  if (adminKey) config.headers['X-Admin-Key'] = adminKey;
  return config;
});

apiClient.interceptors.response.use(response => response, async error => {
  const { config, response } = error;
  const needsAdminKey = response?.status === 401 && response.data?.code === 'ADMIN_KEY_REQUIRED';
  if (!needsAdminKey || !config || config.adminKeyRetried) throw error;

  const promptMessage = readAdminKey()
    ? 'Admin key không đúng. Nhập lại admin key:'
    : 'Thao tác này cần admin key. Nhập admin key:';
  const adminKey = window.prompt(promptMessage)?.trim();
  if (!adminKey) throw error;

  saveAdminKey(adminKey);
  pendingAdminKey = adminKey;
  try {
    return await apiClient({ ...config, adminKeyRetried: true });
  } finally {
    pendingAdminKey = '';
  }
});

export default {
  // --- API Môn học ---
  getSubjects() {
    return apiClient.get('/subjects').then(res => res.data);
  },
  createSubject(name) {
    return apiClient.post('/subjects', { name }).then(res => res.data);
  },
  deleteSubject(id) {
    return apiClient.delete(`/subjects/${id}`).then(res => res.data);
  },

  // --- API Câu hỏi ---
  getQuestions(subjectId = null, search = '', quizName = '', options = {}) {
    const params = {};
    if (subjectId) params.subjectId = subjectId;
    if (search) params.search = search;
    if (quizName) params.quizName = quizName;
    if (options.limit) params.limit = options.limit;
    if (options.offset) params.offset = options.offset;
    return apiClient.get('/questions', { params, signal: options.signal }).then(res => res.data);
  },
  getQuestionStats() {
    return apiClient.get('/questions/stats').then(res => res.data);
  },
  createQuestion(questionData) {
    return apiClient.post('/questions', questionData).then(res => res.data);
  },
  updateQuestion(id, questionData) {
    return apiClient.put(`/questions/${id}`, questionData).then(res => res.data);
  },
  deleteQuestion(id) {
    return apiClient.delete(`/questions/${id}`).then(res => res.data);
  },
  previewImportQuestions(subjectId, importData) {
    return apiClient.post('/questions/import/preview', {
      subjectId,
      ...importData
    }).then(res => res.data);
  },
  importQuestions(subjectId, importData) {
    return apiClient.post('/questions/import', {
      subjectId,
      ...importData
    }).then(res => res.data);
  },
};
