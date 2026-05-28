import express from 'express';
import { getQuestions, getQuestionStats, createQuestion, updateQuestion, deleteQuestion, importQuestions, previewImportQuestions } from '../controllers/questionController.js';

const router = express.Router();

router.route('/')
  .get(getQuestions)
  .post(createQuestion);

router.post('/import/preview', previewImportQuestions);
router.post('/import', importQuestions);
router.get('/stats', getQuestionStats);

router.route('/:id')
  .put(updateQuestion)
  .delete(deleteQuestion);

export default router;
