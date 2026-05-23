import { reactive } from 'vue';

const state = reactive({
  toasts: [],
  modal: null // { title, message, type: 'alert' | 'confirm', onConfirm, onCancel }
});

export function useNotification() {
  const toast = (message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    state.toasts.push({ id, message, type });
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id) => {
    state.toasts = state.toasts.filter(t => t.id !== id);
  };

  const alert = (title, message, onClose) => {
    state.modal = {
      title,
      message,
      type: 'alert',
      onConfirm: () => {
        state.modal = null;
        if (onClose) onClose();
      }
    };
  };

  const confirm = (title, message, onConfirm, onCancel) => {
    state.modal = {
      title,
      message,
      type: 'confirm',
      onConfirm: () => {
        state.modal = null;
        if (onConfirm) onConfirm();
      },
      onCancel: () => {
        state.modal = null;
        if (onCancel) onCancel();
      }
    };
  };

  return {
    state,
    toast,
    alert,
    confirm
  };
}
