import { ensureSupabaseSuccess, getSupabaseClient, isSupabaseEnabled } from './dbService.js';

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? Array.from(new Set(value.filter(Boolean))) : [];
}

function getCoursePayload(rawPayload = {}) {
  return rawPayload.data && typeof rawPayload.data === 'object' ? rawPayload.data : rawPayload;
}

function getVideoUrl(courseId, module = {}) {
  const externalUrls = normalizeArray(module.externalurl || module.externalUrl || module.externalUrls);
  const externalUrl = externalUrls.find(Boolean) || normalizeText(module.externalurl || module.externalUrl);
  if (externalUrl) return externalUrl;

  const moduleId = module.id || module.cmid;
  return courseId && moduleId ? `https://lms-tvu.onschool.edu.vn/course/${courseId}/video/${moduleId}` : '';
}

function mapLessonVideoRow(row = {}) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    courseName: row.course_name,
    weekName: row.week_name,
    lessonName: row.lesson_name,
    moduleId: row.module_id,
    cmid: row.cmid,
    moduleType: row.module_type,
    pageUrl: row.page_url,
    videoUrl: row.video_url,
    externalUrls: row.external_urls || [],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function extractLessonVideosFromCourseJson(rawPayload = {}, subjectId = '') {
  const course = getCoursePayload(rawPayload);
  const courseId = normalizeNumber(course.id || rawPayload.courseId);
  const courseName = normalizeText(course.fullname || course.name || rawPayload.courseName);
  const sections = Array.isArray(course.sections) ? course.sections : [];
  const lessons = [];

  sections.forEach((section, sectionIndex) => {
    const modules = Array.isArray(section.modules) ? section.modules : [];
    const weekName = normalizeText(section.name || section.title || `Tuần ${sectionIndex + 1}`);

    modules.forEach((module, moduleIndex) => {
      if (normalizeText(module.moduletype || module.moduleType) !== 'L') return;
      if (normalizeText(module.type || module.modname).toLowerCase() === 'label') return;

      const moduleId = normalizeNumber(module.id || module.moduleId || module.cmid);
      if (!moduleId) return;
      const cmid = normalizeNumber(module.cmid);
      const videoUrl = getVideoUrl(courseId, module);
      const pageUrl = courseId && moduleId
        ? `https://lms-tvu.onschool.edu.vn/course/${courseId}/video/${moduleId}`
        : videoUrl;

      lessons.push({
        subjectId,
        courseId,
        courseName,
        weekName,
        lessonName: normalizeText(module.name || module.title || `Bài học ${moduleIndex + 1}`),
        moduleId,
        cmid,
        moduleType: 'L',
        pageUrl,
        videoUrl,
        externalUrls: normalizeArray(module.externalurl || module.externalUrl || module.externalUrls),
        sortOrder: lessons.length + 1
      });
    });
  });

  return lessons.sort((a, b) => {
    const weekCompare = normalizeText(a.weekName).localeCompare(normalizeText(b.weekName), 'vi', { numeric: true });
    if (weekCompare !== 0) return weekCompare;
    return (a.moduleId || 0) - (b.moduleId || 0);
  });
}

function toLessonVideoPayload(lesson = {}) {
  return {
    subject_id: lesson.subjectId,
    course_id: lesson.courseId,
    course_name: lesson.courseName,
    week_name: lesson.weekName,
    lesson_name: lesson.lessonName,
    module_id: lesson.moduleId,
    cmid: lesson.cmid,
    module_type: lesson.moduleType || 'L',
    page_url: lesson.pageUrl,
    video_url: lesson.videoUrl,
    external_urls: normalizeArray(lesson.externalUrls),
    sort_order: lesson.sortOrder || 0,
    updated_at: new Date().toISOString()
  };
}

export async function listLessonVideos(subjectId = '') {
  if (!isSupabaseEnabled()) {
    throw new Error('Chức năng bài học video cần cấu hình Supabase.');
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('lesson_videos')
    .select('*')
    .order('week_name', { ascending: true })
    .order('module_id', { ascending: true });

  if (subjectId) query = query.eq('subject_id', subjectId);

  return ensureSupabaseSuccess(await query, 'Lỗi đọc bài học video từ Supabase').map(mapLessonVideoRow);
}

export async function importLessonVideos(rawPayload = {}) {
  if (!isSupabaseEnabled()) {
    throw new Error('Chức năng bài học video cần cấu hình Supabase.');
  }

  const subjectId = normalizeText(rawPayload.subjectId);
  if (!subjectId) throw new Error('Vui lòng chọn môn học trước khi import bài học.');

  const lessons = extractLessonVideosFromCourseJson(rawPayload, subjectId);
  if (lessons.length === 0) {
    return { totalCount: 0, importedCount: 0, lessons: [] };
  }

  const supabase = getSupabaseClient();
  const rows = lessons.map(toLessonVideoPayload);
  const result = await supabase
    .from('lesson_videos')
    .upsert(rows, { onConflict: 'subject_id,module_id' })
    .select('*');

  const data = ensureSupabaseSuccess(result, 'Lỗi lưu bài học video lên Supabase').map(mapLessonVideoRow);
  return {
    totalCount: lessons.length,
    importedCount: data.length,
    lessons: data
  };
}
