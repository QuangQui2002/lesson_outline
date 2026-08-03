import { getSubjectByName, insertSubject, listSubjectsWithCounts, removeSubject } from '../services/dbService.js';

export async function getSubjects(req, res, next) {
  try {
    res.json({ success: true, data: await listSubjectsWithCounts() });
  } catch (error) {
    next(error);
  }
}

export async function createSubject(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Tên môn học không được để trống' });
    }
    if (await getSubjectByName(name)) {
      return res.status(400).json({ success: false, message: 'Môn học này đã tồn tại!' });
    }

    const subject = await insertSubject({
      id: 'sub_' + Date.now(),
      name,
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, message: 'Thêm môn học thành công', data: subject });
  } catch (error) {
    next(error);
  }
}

export async function deleteSubject(req, res, next) {
  try {
    if (!await removeSubject(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy môn học' });
    }
    res.json({
      success: true,
      message: 'Xóa môn học và toàn bộ câu hỏi thuộc môn học thành công!'
    });
  } catch (error) {
    next(error);
  }
}
