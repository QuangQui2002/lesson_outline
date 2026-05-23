<template>
  <div class="app-container">
    
    <!-- Sidebar bên trái (Trái tim của Dashboard) -->
    <aside class="sidebar">
      <!-- Logo thương hiệu -->
      <div class="logo-section">
        <div class="logo-icon">📚</div>
        <div class="logo-text">
          <h2 style="font-size: 1.15rem; font-weight: 800; line-height: 1.1;">DEV Lỏ</h2>
          <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600; tracking-wide: yes;">ĐỀ CƯƠNG NỘI BỘ</span>
        </div>
      </div>

      <!-- Danh sách Môn học (Chèn qua slot hoặc dùng trực tiếp) -->
      <slot name="sidebar"></slot>

      <!-- Phần chân sidebar bao gồm Dark Mode toggle -->
      <div class="sidebar-footer">
        <button class="theme-toggle-btn" @click="toggleDarkMode">
          <span v-if="isDark">☀️ Chế Độ Sáng</span>
          <span v-else>🌙 Chế Độ Tối</span>
        </button>
      </div>
    </aside>

    <!-- Khu vực nội dung chính bên phải -->
    <main class="main-content">
      
      <!-- Thanh điều hướng trên cùng (Top Bar) -->
      <header class="top-bar">
        <div class="page-title">
          <h1>Ngân Hàng Câu Hỏi Đề Cương</h1>
          <p>Hệ thống lưu trữ câu hỏi, đáp án ôn tập & quét OCR thông minh</p>
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-secondary" @click="$emit('open-ocr')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Quét Ảnh OCR
          </button>
          <button class="btn btn-primary" @click="$emit('open-add')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Thêm Câu Hỏi
          </button>
        </div>
      </header>

      <!-- Nội dung trang hiển thị ở đây -->
      <slot></slot>

    </main>

  </div>
</template>

<script>
import { useDarkMode } from '../composables/useDarkMode.js';

export default {
  name: 'DefaultLayout',
  emits: ['open-ocr', 'open-add'],
  setup() {
    const { isDark, toggleDarkMode, initTheme } = useDarkMode();
    
    // Khởi tạo theme khi mount
    initTheme();

    return {
      isDark,
      toggleDarkMode
    };
  }
};
</script>
