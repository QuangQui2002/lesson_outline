import express from 'express';
import { solveAttemptAnswers } from '../controllers/attemptAnswerController.js';

const router = express.Router();

router.post('/solve', solveAttemptAnswers);

export default router;
