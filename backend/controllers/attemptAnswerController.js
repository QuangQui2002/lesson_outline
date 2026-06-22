import { solveAttemptQuestions } from '../services/attemptAnswerService.js';

export async function solveAttemptAnswers(req, res, next) {
  try {
    const result = await solveAttemptQuestions(req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
