import express from 'express';
import { upload } from '../middleware/uploadMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { processOcr } from '../controllers/ocrController.js';

const router = express.Router();
const ocrLimiter = rateLimit({ windowMs: 60000, max: 10, message: 'Gửi OCR quá nhiều lần, vui lòng thử lại sau 1 phút.' });

// Route upload file ảnh và chạy nhận diện chữ
router.post('/', ocrLimiter, upload.single('image'), processOcr);

export default router;
