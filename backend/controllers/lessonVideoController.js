import { importLessonVideos, listLessonVideos } from '../services/lessonVideoService.js';

export async function getLessonVideos(req, res, next) {
  try {
    const lessons = await listLessonVideos(req.query.subjectId || '');
    res.json({ success: true, data: lessons });
  } catch (error) {
    next(error);
  }
}

export async function importCourseLessonVideos(req, res, next) {
  try {
    const result = await importLessonVideos(req.body);
    res.status(201).json({
      success: true,
      message: 'Đã import danh sách bài học video.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}
