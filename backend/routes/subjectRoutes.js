import express from 'express';
import { getSubjects, createSubject, deleteSubject } from '../controllers/subjectController.js';

const router = express.Router();

router.route('/')
  .get(getSubjects)
  .post(createSubject);

router.route('/:id')
  .delete(deleteSubject);

export default router;
