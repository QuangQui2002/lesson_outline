<template>
  <div class="notification-system">
    <!-- 1. Danh sách Toast notifications ở góc trên bên phải -->
    <transition-group name="toast-list" tag="div" class="toast-container">
      <div 
        v-for="toast in state.toasts" 
        :key="toast.id" 
        class="toast-item" 
        :class="toast.type"
      >
        <span class="toast-icon">
          <span v-if="toast.type === 'success'">✅</span>
          <span v-else-if="toast.type === 'error'">❌</span>
          <span v-else-if="toast.type === 'warning'">⚠️</span>
          <span v-else>ℹ️</span>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </transition-group>

    <!-- 2. Modal Alert / Confirm cao cấp thay thế alert() và confirm() -->
    <transition name="modal-fade">
      <div v-if="state.modal" class="modal-alert-backdrop" @click.self="handleOutsideClick">
        <div class="modal-alert-card" :class="state.modal.type">
          <div class="modal-alert-header">
            <div class="modal-alert-icon-wrapper">
              <span v-if="state.modal.type === 'confirm'" class="modal-alert-icon">❓</span>
              <span v-else class="modal-alert-icon">⚠️</span>
            </div>
            <h3>{{ state.modal.title }}</h3>
          </div>
          
          <div class="modal-alert-body">
            <p>{{ state.modal.message }}</p>
          </div>
          
          <div class="modal-alert-footer">
            <!-- Nút Hủy (Chỉ hiện trong confirm mode) -->
            <button 
              v-if="state.modal.type === 'confirm'" 
              type="button" 
              class="btn btn-secondary modal-alert-btn" 
              @click="state.modal.onCancel"
            >
              Hủy Bỏ
            </button>
            <!-- Nút Xác Nhận / Đồng Ý -->
            <button 
              type="button" 
              class="btn btn-primary modal-alert-btn confirm-btn" 
              @click="state.modal.onConfirm"
            >
              Đồng Ý
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { useNotification } from '../composables/useNotification.js';

export default {
  name: 'NotificationContainer',
  setup() {
    const { state } = useNotification();
    
    const handleOutsideClick = () => {
      // Nếu là alert thì click ra ngoài tự động đóng (xác nhận)
      if (state.modal && state.modal.type === 'alert') {
        state.modal.onConfirm();
      }
    };

    return {
      state,
      handleOutsideClick
    };
  }
};
</script>

<style scoped>
/* Toasts Container */
.toast-container {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: none;
  max-width: 380px;
  width: 90%;
}

/* Toast Items */
.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  border-radius: var(--radius-md);
  background: rgba(var(--bg-card-rgb, 255, 255, 255), 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-message {
  font-size: 0.9rem;
  font-weight: 550;
  color: var(--text-main);
  line-height: 1.4;
}

/* Kiểu loại toast */
.toast-item.success {
  border-left: 4px solid var(--success);
}
.toast-item.error {
  border-left: 4px solid var(--danger);
}
.toast-item.warning {
  border-left: 4px solid var(--warning);
}
.toast-item.info {
  border-left: 4px solid var(--primary);
}

/* Animations for Toasts */
.toast-list-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
}
.toast-list-leave-to {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
}
.toast-list-leave-active {
  position: absolute;
}

/* Custom Alert/Confirm Modal Backdrop */
.modal-alert-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10100;
}

/* Card thiết kế Premium Glassmorphism */
.modal-alert-card {
  width: 90%;
  max-width: 440px;
  background: var(--bg-card);
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  padding: 1.75rem;
  transform: scale(1);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-alert-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.modal-alert-icon-wrapper {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: var(--primary-light);
  color: var(--primary);
}

.modal-alert-card.confirm .modal-alert-icon-wrapper {
  background: var(--primary-light);
  color: var(--primary);
}

.modal-alert-card.alert .modal-alert-icon-wrapper {
  background: var(--warning-light);
  color: var(--warning);
}

.modal-alert-header h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.modal-alert-body {
  margin-bottom: 1.5rem;
}

.modal-alert-body p {
  font-size: 0.95rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.modal-alert-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.modal-alert-btn {
  padding: 0.55rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  min-width: 90px;
}

.confirm-btn {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  border: none;
}

.confirm-btn:hover {
  filter: brightness(1.15);
}

/* Animations for Modal */
.modal-fade-enter-from {
  opacity: 0;
}
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-from .modal-alert-card {
  transform: scale(0.9) translateY(20px);
}
.modal-fade-leave-to .modal-alert-card {
  transform: scale(0.9) translateY(20px);
}
.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.25s ease;
}
</style>
