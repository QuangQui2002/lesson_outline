import express from 'express';
import { getLessonVideos, importCourseLessonVideos } from '../controllers/lessonVideoController.js';

const router = express.Router();

router.get('/', getLessonVideos);
router.post('/import-course', importCourseLessonVideos);

export default router;
