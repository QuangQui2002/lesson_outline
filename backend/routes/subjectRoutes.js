import express from 'express';
import { getSubjects, createSubject, deleteSubject } from '../controllers/subjectController.js';
import { requireAdminKey } from '../middleware/adminAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();
const createSubjectLimiter = rateLimit({ windowMs: 60000, max: 30, message: 'Tạo môn học quá nhiều lần, vui lòng thử lại sau 1 phút.' });

router.route('/')
  .get(getSubjects)
  .post(createSubjectLimiter, createSubject);

router.route('/:id')
  .delete(requireAdminKey, deleteSubject);

export default router;
