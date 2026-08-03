# Ngân Hàng Đề Cương Câu Hỏi & Đáp Án Thông Minh (OCR Q&A Bank)

Hệ thống lưu trữ đề cương câu hỏi nội bộ sử dụng **Vue.js 3 (Vite) + Node.js Express**. Ứng dụng hỗ trợ quản lý môn học, câu hỏi, đáp án, tìm kiếm, import JSON, OCR từ hình ảnh bằng **Tesseract.js**, lưu dữ liệu bằng **Supabase** khi có cấu hình production và fallback về file JSON khi chạy local.

## Tính năng chính

1. **Quản lý môn học:** thêm, xóa môn học; khi xóa môn học, các câu hỏi liên quan cũng được xóa theo.
2. **Quản lý câu hỏi:** thêm mới, cập nhật, xóa nội dung câu hỏi, đáp án và tags.
3. **Tìm kiếm thời gian thực:** lọc câu hỏi theo nội dung, đáp án hoặc tags.
4. **Import JSON:** nhập danh sách câu hỏi từ JSON, xem trước trước khi import, tự bỏ qua câu hỏi trùng.
5. **OCR hình ảnh:** tải ảnh đề cương lên để nhận diện chữ tiếng Việt/tiếng Anh bằng Tesseract.js.
6. **Giao diện hiện đại:** dashboard responsive, hỗ trợ dark mode.
7. **Thông báo Telegram:** backend gửi Telegram khi API bị lỗi, ví dụ lỗi lấy dữ liệu, tạo, sửa, xóa hoặc import.

---

## Yêu cầu hệ thống

- Node.js 18 trở lên.
- npm.
- Kết nối Internet nếu dùng OCR lần đầu, vì Tesseract.js cần tải dữ liệu ngôn ngữ.
- Tài khoản Supabase nếu chạy production với database cloud.

---

## Cài đặt và chạy local

Dự án gồm hai phần chính:

- `backend`: Express API.
- `frontend`: Vue 3 + Vite.

### 1. Chạy backend

```bash
cd backend
npm install
npm run dev
```

Mặc định backend chạy tại:

```text
http://localhost:3000
```

Nếu không cấu hình Supabase, backend dùng dữ liệu local tại:

```text
backend/data/db.json
```

### 2. Chạy frontend

Mở terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Mặc định frontend chạy tại:

```text
http://localhost:5173
```

Frontend local đọc cấu hình từ `frontend/.env.development` và gọi backend tại:

```text
http://localhost:3000/api
```

Muốn đổi riêng trên máy mà không sửa file chung, tạo `frontend/.env.development.local`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## Build production

### Frontend

```bash
cd frontend
npm run build
```

Thư mục build:

```text
frontend/dist
```

### Backend

```bash
cd backend
npm start
```

---

## Cấu hình deploy trên Render

Build production mặc định đọc `frontend/.env.production`. Nếu frontend và backend deploy riêng, có thể override biến môi trường trên hosting provider:

```env
VITE_API_BASE_URL=https://lesson-outline-h788.onrender.com/api
```

Lưu ý: với Vite, biến `VITE_*` được nhúng lúc build. Sau khi thêm hoặc sửa biến môi trường, cần redeploy frontend.

Backend trên Render cần có:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Có thể kiểm tra backend bằng:

```text
https://lesson-outline-h788.onrender.com/api/health/db
```

Nếu trả `success: true`, backend đã kết nối Supabase thành công.

---

## Lưu trữ dữ liệu bằng Supabase

Production nên dùng Supabase thay cho `backend/data/db.json` để dữ liệu không mất khi Render/Vercel redeploy.

### 1. Tạo bảng

Vào Supabase Dashboard → SQL Editor → chạy nội dung file:

```text
backend/supabase/schema.sql
```

### 2. Cấu hình biến môi trường backend

Local dev có thể copy file mẫu rồi điền key thật:

```powershell
Copy-Item backend/.env.example backend/.env
```

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Không đưa `backend/.env` hoặc `SUPABASE_SERVICE_ROLE_KEY` vào frontend/GitHub.

### 3. Import dữ liệu cũ từ JSON lên Supabase

Chạy một lần ở máy local sau khi đã set env:

```powershell
cd backend
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run seed:supabase
```

Khi có `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`, backend tự đọc/ghi Supabase. Nếu thiếu env, backend fallback về `backend/data/db.json` cho local dev.

---

## Import JSON câu hỏi

API import hỗ trợ payload dạng:

```json
{
  "subjectId": "subject_id",
  "questions": [
    {
      "questiontext": "Nội dung câu hỏi",
      "answertext": [
        { "answer": "Đáp án A", "fraction": 100 },
        { "answer": "Đáp án B", "fraction": 0 }
      ],
      "generalfeedback": "Giải thích hoặc đáp án đúng"
    }
  ]
}
```

Khi import, hệ thống chỉ lưu **nội dung câu hỏi**, không tự thêm tiền tố `Câu 1:`, `Câu 2:`. Nếu nội dung JSON đã có tiền tố số câu, backend sẽ cố gắng loại bỏ tiền tố đó.

---

## Telegram API notifications

Backend có thể gửi Telegram khi API bị lỗi. Các request thành công `2xx` và redirect `3xx` sẽ không gửi thông báo.

Thêm các biến này vào `backend/.env` hoặc Environment Variables của hosting provider:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
TELEGRAM_NOTIFY_IGNORE_PATHS=/api/ping,/api/health/db
TELEGRAM_DAILY_REPORT_CRON=59 23 * * *
```

Cách lấy giá trị:

1. Tạo bot bằng BotFather và copy bot token.
2. Gửi tin nhắn cho bot hoặc thêm bot vào group.
3. Lấy chat id rồi set vào `TELEGRAM_CHAT_ID`.

`TELEGRAM_NOTIFY_IGNORE_PATHS` là tùy chọn, dùng để bỏ qua health check hoặc keep-alive ping.

Daily report chạy mặc định lúc 23:59 theo múi giờ `Asia/Ho_Chi_Minh`. Thống kê API được lưu trong bảng Supabase `api_daily_stats`; nếu thiếu Supabase env, backend dùng thống kê in-memory cho local dev.

---

## Cấu trúc thư mục

```text
lesson_outline/
├── backend/
│   ├── controllers/
│   ├── data/
│   ├── middleware/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── supabase/
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── composables/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.vue
│   │   └── main.js
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Lưu ý OCR

- Lần đầu dùng OCR, Tesseract.js có thể tải dữ liệu ngôn ngữ `vie.traineddata` và `eng.traineddata`.
- Ảnh càng rõ chữ, ít nhòe, ít nghiêng thì kết quả nhận diện càng tốt.
- Nên kiểm tra và chỉnh sửa nội dung OCR trước khi lưu vào ngân hàng câu hỏi.
