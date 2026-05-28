import { readDb, writeDb } from '../services/dbService.js';

/**
 * Lấy danh sách toàn bộ môn học
 */
export async function getSubjects(req, res, next) {
  try {
    const db = await readDb();
    const questionCounts = {};

    db.questions.forEach(question => {
      questionCounts[question.subjectId] = (questionCounts[question.subjectId] || 0) + 1;
    });

    res.json({
      success: true,
      data: db.subjects.map(subject => ({
        ...subject,
        questionCount: questionCounts[subject.id] || 0
      }))
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Thêm môn học mới
 */
export async function createSubject(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Tên môn học không được để trống' });
    }

    const db = await readDb();
    
    // Kiểm tra trùng tên môn học
    const duplicate = db.subjects.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'Môn học này đã tồn tại!' });
    }

    const newSubject = {
      id: 'sub_' + Date.now(),
      name: name.trim(),
      createdAt: new Date().toISOString()
    };

    db.subjects.push(newSubject);
    await writeDb(db);

    res.status(201).json({
      success: true,
      message: 'Thêm môn học thành công',
      data: newSubject
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa môn học và cascade xóa toàn bộ câu hỏi liên quan
 */
export async function deleteSubject(req, res, next) {
  try {
    const { id } = req.params;
    const db = await readDb();

    const subjectIndex = db.subjects.findIndex(s => s.id === id);
    if (subjectIndex === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy môn học' });
    }

    // Xóa môn học
    db.subjects.splice(subjectIndex, 1);

    // Cascade: Xóa toàn bộ câu hỏi thuộc môn học này
    db.questions = db.questions.filter(q => q.subjectId !== id);

    await writeDb(db);

    res.json({
      success: true,
      message: 'Xóa môn học và toàn bộ câu hỏi thuộc môn học thành công!'
    });
  } catch (error) {
    next(error);
  }
}
