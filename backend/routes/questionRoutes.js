import express from 'express';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, importQuestions } from '../controllers/questionController.js';

const router = express.Router();

router.route('/')
  .get(getQuestions)
  .post(createQuestion);

router.post('/import', importQuestions);

router.route('/:id')
  .put(updateQuestion)
  .delete(deleteQuestion);

export default router;
