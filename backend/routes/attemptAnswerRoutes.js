import express from 'express';
import { solveAttemptAnswers } from '../controllers/attemptAnswerController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();
const solveLimiter = rateLimit({ windowMs: 60000, max: 20, message: 'Gửi yêu cầu giải đáp án quá nhiều lần, vui lòng thử lại sau 1 phút.' });

router.post('/solve', solveLimiter, solveAttemptAnswers);

export default router;
