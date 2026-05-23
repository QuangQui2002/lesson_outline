import express from 'express';
import cors from 'cors';
import subjectRoutes from './routes/subjectRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import ocrRoutes from './routes/ocrRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình CORS cho phép frontend kết nối
app.use(cors({
  origin: '*', // Trong môi trường nội bộ, cho phép tất cả các nguồn kết nối
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Parsers cho dữ liệu request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Khai báo các Routes chính của API
app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/ocr', ocrRoutes);

// Khai báo Route mặc định để kiểm tra trạng thái Server
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Hệ thống ngân hàng câu hỏi đề cương API hoạt động bình thường.'
  });
});

// Middleware xử lý lỗi tập trung
app.use(errorHandler);

// Bắt đầu lắng nghe cổng kết nối
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
