import axios from 'axios';

// Kết nối tới API của Express Backend chạy ở cổng 3000
const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api',
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
  getQuestions(subjectId = null, search = '') {
    const params = {};
    if (subjectId) params.subjectId = subjectId;
    if (search) params.search = search;
    return apiClient.get('/questions', { params }).then(res => res.data);
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

  // --- API OCR ---
  uploadOcrImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.post('/ocr', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }).then(res => res.data);
  }
};
