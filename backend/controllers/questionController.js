import { readDb, writeDb } from '../services/dbService.js';

/**
 * Lấy danh sách câu hỏi (hỗ trợ lọc theo subjectId và tìm kiếm thời gian thực)
 */
export async function getQuestions(req, res, next) {
  try {
    const { subjectId, search } = req.query;
    const db = await readDb();
    let result = db.questions;

    // Lọc theo môn học nếu có
    if (subjectId) {
      result = result.filter(q => q.subjectId === subjectId);
    }

    // Tìm kiếm nếu có
    if (search && search.trim() !== '') {
      const searchKeyword = search.trim().toLowerCase();
      result = result.filter(q => {
        const matchContent = q.content && q.content.toLowerCase().includes(searchKeyword);
        const matchAnswer = q.answer && q.answer.toLowerCase().includes(searchKeyword);
        const matchTags = q.tags && q.tags.some(tag => tag.toLowerCase().includes(searchKeyword));
        return matchContent || matchAnswer || matchTags;
      });
    }

    // Sắp xếp câu hỏi mới nhất lên đầu
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Thêm câu hỏi mới vào môn học
 */
export async function createQuestion(req, res, next) {
  try {
    const { subjectId, content, answer, tags } = req.body;

    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'ID môn học là bắt buộc' });
    }
    if (!content || content.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nội dung câu hỏi không được để trống' });
    }
    if (!answer || answer.trim() === '') {
      return res.status(400).json({ success: false, message: 'Đáp án câu hỏi không được để trống' });
    }

    const db = await readDb();

    // Kiểm tra xem môn học có tồn tại không
    const subjectExists = db.subjects.some(s => s.id === subjectId);
    if (!subjectExists) {
      return res.status(400).json({ success: false, message: 'Môn học không tồn tại trong hệ thống' });
    }

    // Xử lý tags (đảm bảo là mảng các từ viết thường và cắt khoảng trắng)
    let processedTags = [];
    if (Array.isArray(tags)) {
      processedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t !== '');
    } else if (typeof tags === 'string') {
      processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
    }

    const newQuestion = {
      id: 'q_' + Date.now(),
      subjectId: subjectId,
      content: content.trim(),
      answer: answer.trim(),
      tags: processedTags,
      createdAt: new Date().toISOString()
    };

    db.questions.push(newQuestion);
    await writeDb(db);

    res.status(201).json({
      success: true,
      message: 'Thêm câu hỏi thành công',
      data: newQuestion
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật nội dung câu hỏi
 */
export async function updateQuestion(req, res, next) {
  try {
    const { id } = req.params;
    const { subjectId, content, answer, tags } = req.body;

    const db = await readDb();
    const questionIndex = db.questions.findIndex(q => q.id === id);

    if (questionIndex === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi để cập nhật' });
    }

    // Nếu thay đổi môn học, kiểm tra tính hợp lệ
    if (subjectId) {
      const subjectExists = db.subjects.some(s => s.id === subjectId);
      if (!subjectExists) {
        return res.status(400).json({ success: false, message: 'Môn học mới không tồn tại trong hệ thống' });
      }
      db.questions[questionIndex].subjectId = subjectId;
    }

    if (content !== undefined) {
      if (content.trim() === '') {
        return res.status(400).json({ success: false, message: 'Nội dung câu hỏi không được để trống' });
      }
      db.questions[questionIndex].content = content.trim();
    }

    if (answer !== undefined) {
      if (answer.trim() === '') {
        return res.status(400).json({ success: false, message: 'Đáp án không được để trống' });
      }
      db.questions[questionIndex].answer = answer.trim();
    }

    if (tags !== undefined) {
      let processedTags = [];
      if (Array.isArray(tags)) {
        processedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t !== '');
      } else if (typeof tags === 'string') {
        processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
      }
      db.questions[questionIndex].tags = processedTags;
    }

    await writeDb(db);

    res.json({
      success: true,
      message: 'Cập nhật câu hỏi thành công',
      data: db.questions[questionIndex]
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa câu hỏi khỏi ngân hàng đề
 */
export async function deleteQuestion(req, res, next) {
  try {
    const { id } = req.params;
    const db = await readDb();

    const questionIndex = db.questions.findIndex(q => q.id === id);
    if (questionIndex === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi' });
    }

    db.questions.splice(questionIndex, 1);
    await writeDb(db);

    res.json({
      success: true,
      message: 'Xóa câu hỏi thành công!'
    });
  } catch (error) {
    next(error);
  }
}
