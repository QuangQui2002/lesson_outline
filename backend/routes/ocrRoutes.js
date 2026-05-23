import express from 'express';
import { upload } from '../middleware/uploadMiddleware.js';
import { processOcr } from '../controllers/ocrController.js';

const router = express.Router();

// Route upload file ảnh và chạy nhận diện chữ
router.post('/', upload.single('image'), processOcr);

export default router;
