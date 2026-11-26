import express from 'express';
import { getQuestions, getQuestionStats, createQuestion, updateQuestion, deleteQuestion, importQuestions, previewImportQuestions } from '../controllers/questionController.js';
import { requireAdminKey } from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();
const importLimiter = rateLimit({ windowMs: 60000, max: 30, message: 'Import quá nhiều lần, vui lòng thử lại sau 1 phút.' });

router.route('/')
  .get(getQuestions)
  .post(requireAdminKey, createQuestion);

// Import để mở cho extension LMS, chỉ giới hạn tần suất
router.post('/import/preview', importLimiter, previewImportQuestions);
router.post('/import', importLimiter, importQuestions);
router.get('/stats', getQuestionStats);

router.route('/:id')
  .put(requireAdminKey, updateQuestion)
  .delete(deleteQuestion);

export default router;
