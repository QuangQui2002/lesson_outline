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

  // --- API Bài học video ---
  getLessonVideos(subjectId = null) {
    const params = {};
    if (subjectId) params.subjectId = subjectId;
    return apiClient.get('/lesson-videos', { params }).then(res => res.data);
  },
};
