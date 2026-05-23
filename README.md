# Ngân Hàng Đề Cương Câu Hỏi & Đáp Án Thông Minh (OCR Q&A Bank)

Hệ thống lưu trữ đề cương câu hỏi nội bộ sử dụng **Vue.js 3 (Vite) + Node.js Express** và lưu trữ dữ liệu thông qua tệp tin JSON đơn giản. Hệ thống được trang bị công nghệ nhận dạng ký tự quang học **Tesseract.js** giúp quét và tự động trích xuất nội dung câu hỏi từ hình ảnh đề cương một cách nhanh chóng.

## 🌟 Tính Năng Chính
1. **Quản Lý Môn Học:** Thêm môn học, xóa môn học trực tiếp ở sidebar (xóa môn học sẽ tự động xóa tất cả câu hỏi liên quan dạng cascade).
2. **Quản Lý Câu Hỏi:** Thêm mới, cập nhật nội dung, đáp án và từ khóa (tags) cho từng câu hỏi thuộc môn học.
3. **Tìm Kiếm Thời Gian Thực:** Ô tìm kiếm hiệu năng cao lọc kết quả trực tiếp ngay khi gõ từ khóa (tìm kiếm theo nội dung, đáp án hoặc các tags từ khóa).
4. **Quét Chữ Hình Ảnh (OCR):** Tải hình ảnh đề cương lên (kéo thả hoặc chọn tệp), hệ thống sẽ sử dụng **Tesseract.js** ở backend để nhận diện chữ tiếng Việt và hiển thị khung soạn thảo cho phép bạn kiểm tra, chỉnh sửa trước khi lưu vào cơ sở dữ liệu.
5. **Giao Diện Hiện Đại & Dark Mode:** Được thiết kế tối giản, responsive, mang đậm phong cách dashboard cao cấp với các hiệu ứng kính (glassmorphism), chuyển giao diện sáng/tối mượt mà.

---

## 🛠️ Yêu Cầu Hệ Thống
* Máy tính đã cài đặt **Node.js** (Khuyến nghị phiên bản 18 trở lên)
* Kết nối Internet (trong lần chạy OCR đầu tiên, Tesseract.js cần tải gói dữ liệu ngôn ngữ tiếng Việt và tiếng Anh)

---

## 🚀 Hướng Dẫn Cài Đặt Và Chạy Dự Án

Dự án được chia làm hai phần chính: **backend** (API Express) và **frontend** (VueJS Vite). Dưới đây là cách khởi động chi tiết.

### Bước 1: Khởi động Backend (Express API)
1. Mở terminal và chuyển hướng vào thư mục backend:
   ```bash
   cd backend
   ```
2. Cài đặt các gói phụ thuộc:
   ```bash
   npm install
   ```
3. Chạy Server ở chế độ phát triển (Sử dụng `nodemon` để tự động khởi động lại khi thay đổi code):
   ```bash
   npm run dev
   ```
   * *Server API sẽ chạy tại: **http://localhost:3000***
   * *Dữ liệu đề cương được lưu tại file local: `backend/data/db.json`*

### Bước 2: Khởi động Frontend (VueJS + Vite)
1. Mở một terminal mới và chuyển hướng vào thư mục frontend:
   ```bash
   cd frontend
   ```
2. Cài đặt các gói phụ thuộc:
   ```bash
   npm install
   ```
3. Khởi động Vite dev server:
   ```bash
   npm run dev
   ```
   * *Ứng dụng Web sẽ được khởi tạo tại: **http://localhost:5173***
   * Mở trình duyệt và truy cập địa chỉ trên để trải nghiệm ứng dụng.

---

## 🗂️ Cấu Trúc Dự Án
```
d:\lesson_outline\
├── backend\                   # NodeJS Express API
│   ├── data/db.json           # File lưu trữ dữ liệu JSON cục bộ
│   ├── controllers/           # Xử lý logic nghiệp vụ API
│   ├── routes/                # Cấu hình định tuyến API
│   ├── services/              # Dịch vụ đọc ghi DB, xử lý OCR
│   ├── middleware/            # Cấu hình tải ảnh Multer, bắt lỗi
│   └── server.js              # Entrypoint của Backend
├── frontend\                  # VueJS Vite Web App
│   ├── src/
│   │   ├── assets/styles.css  # Giao diện CSS tùy biến cao cấp (Light/Dark Mode)
│   │   ├── components/        # Các component dùng chung (Modal, Danh sách môn học/câu hỏi)
│   │   ├── composables/       # Quản lý trạng thái giao diện tối (useDarkMode)
│   │   ├── layouts/           # DefaultLayout (sidebar & top-bar)
│   │   ├── pages/Dashboard.vue# Trang Dashboard chính của ứng dụng
│   │   ├── services/api.js    # Axios Client kết nối Backend API
│   │   ├── App.vue            # Component gốc của Vue
│   │   └── main.js            # Entrypoint của Frontend
│   ├── index.html             # HTML Shell chính
│   └── vite.config.js         # Cấu hình Vite
└── README.md                  # Hướng dẫn chạy dự án này
```

---

## 💡 Lưu ý khi quét ảnh OCR
* Lần đầu tiên bạn sử dụng tính năng **Quét Ảnh OCR**, thư viện `tesseract.js` sẽ tự động tải 2 file ngôn ngữ `vie.traineddata` (Tiếng Việt) và `eng.traineddata` (Tiếng Anh) từ CDN toàn cầu về lưu trữ cục bộ để xử lý. Các lần quét tiếp theo sẽ diễn ra cực kỳ nhanh chóng mà không cần tải lại.
* Để đạt độ chính xác cao nhất cho OCR, hãy đảm bảo ảnh tải lên rõ chữ, không bị nhòe và có góc xoay thẳng.
