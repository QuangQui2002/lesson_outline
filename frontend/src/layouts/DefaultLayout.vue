<template>
  <div class="app-container">
    <!-- Sidebar bên trái -->
    <aside class="sidebar">
      <!-- Logo ứng dụng -->
      <div class="logo-section">
        <div class="logo-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" role="img" focusable="false">
            <path d="M10 10.5A4.5 4.5 0 0 1 14.5 6H38v32.5H14.5A4.5 4.5 0 0 0 10 43V10.5Z" fill="currentColor" opacity="0.22" />
            <path d="M14.5 6H38v32H14.5A4.5 4.5 0 0 0 10 42.5v-32A4.5 4.5 0 0 1 14.5 6Z" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M17 16h14M17 23h14M17 30h9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
            <path d="M33.5 32.5l2.2 2.2 5.3-6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="logo-text">
          <h2 style="font-size: 1.15rem; font-weight: 800; line-height: 1.1;">Ngân Hàng Đề Cương</h2>
          <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.08em;">CÂU HỎI & ĐÁP ÁN</span>
        </div>
      </div>

      <!-- Danh sách môn học -->
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
      <!-- Thanh điều hướng trên cùng -->
      <header class="top-bar">
        <div class="page-title">
          <h1>Ngân Hàng Câu Hỏi Đề Cương</h1>
          <p>Hệ thống lưu trữ và quản lý câu hỏi, đáp án ôn tập</p>
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-secondary" @click="$emit('export-json')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Xuất JSON
          </button>
          <button class="btn btn-secondary" @click="$emit('import-json')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg>
            Import JSON
          </button>
          <button class="btn btn-secondary" @click="$emit('export-word')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13l1.5 5 2.5-4 2.5 4 1.5-5"></path></svg>
            Xuất Word
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
  emits: ['open-add', 'import-json', 'export-json', 'export-word'],
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
