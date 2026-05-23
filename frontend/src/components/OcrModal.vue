<template>
  <!-- Backdrop: click trực tiếp vào vùng tối sẽ đóng modal (chỉ khi không đang lưu) -->
  <div v-if="isOpen" class="modal-backdrop" @click="handleBackdropClick">
    <!-- Input file ẩn đặt ngoài v-if để luôn tồn tại trong DOM -->
    <input 
      ref="fileInput"
      type="file" 
      accept="image/*" 
      multiple
      style="display: none;" 
      @change="handleFileSelect"
    />

    <div class="modal-content" :style="{ maxWidth: pendingItems.length > 0 ? '950px' : '600px', width: '95%' }">
      
      <!-- Modal Header -->
      <div class="modal-header">
        <h3>Quét Chữ Hình Ảnh (OCR) Đề Cương - Nhập Hàng Loạt</h3>
        <button class="close-btn" @click="closeModal" :disabled="isSavingAll">&times;</button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
        
        <!-- Trạng thái 1: Chưa chọn ảnh -> Vùng kéo thả file hỗ trợ MULTIPLE -->
        <div 
          v-if="pendingItems.length === 0" 
          class="dropzone"
          @dragover.prevent
          @drop.prevent="handleFileDrop"
          @click="triggerFileInput"
        >
          <div class="dropzone-icon">📷</div>
          <p style="font-weight: 600;">Kéo & Thả một hoặc NHIỀU ảnh vào đây hoặc Nhấp để chọn</p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Hỗ trợ kéo thả nhiều tệp, hoặc chụp màn hình rồi nhấn dán trực tiếp (Ctrl+V)</p>
        </div>

        <!-- Trạng thái 2: Hiển thị danh sách câu hỏi hàng loạt đang xử lý / đã quét xong -->
        <div v-else style="display: flex; flex-direction: column; gap: 1.5rem;">
          
          <!-- Thanh công cụ điều khiển thêm tệp mới -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--primary-light); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); border: 1px dashed var(--primary);">
            <div style="font-size: 0.95rem; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
              <span>📋</span> Hàng chờ nhập liệu: <strong>{{ pendingItems.length }}</strong> hình ảnh đề cương
            </div>
            <button 
              type="button" 
              class="btn btn-primary" 
              style="padding: 0.5rem 1rem; font-size: 0.8rem; border-radius: var(--radius-sm);" 
              @click="triggerFileInput"
              :disabled="isSavingAll"
            >
              ➕ Thêm Ảnh Mới
            </button>
          </div>

          <!-- Danh sách thẻ hình ảnh trong hàng chờ -->
          <div class="pending-list" style="display: flex; flex-direction: column; gap: 1.5rem;">
            <div 
              v-for="(item, index) in pendingItems" 
              :key="item.id"
              class="pending-card"
              style="background: var(--bg-card); border: 1px solid var(--border-color-strong); border-radius: var(--radius-md); padding: 1.5rem; position: relative;"
            >
              <!-- Phần Header của thẻ ảnh lẻ -->
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color-strong); padding-bottom: 0.75rem; margin-bottom: 1.25rem;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="item.file.name">
                  Câu hỏi #{{ index + 1 }} - {{ item.file.name }}
                </h4>
                
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                  <!-- Huy hiệu trạng thái -->
                  <span 
                    v-if="item.isLoading" 
                    style="font-size: 0.75rem; background: var(--warning-light); color: var(--warning); padding: 0.25rem 0.65rem; border-radius: var(--radius-full); font-weight: 700;"
                  >
                    ⏳ Đang quét OCR...
                  </span>
                  <span 
                    v-else-if="item.error" 
                    style="font-size: 0.75rem; background: var(--danger-light); color: var(--danger); padding: 0.25rem 0.65rem; border-radius: var(--radius-full); font-weight: 700;"
                  >
                    ❌ Lỗi nhận diện
                  </span>
                  <span 
                    v-else-if="item.hasResult" 
                    style="font-size: 0.75rem; background: var(--success-light); color: var(--success); padding: 0.25rem 0.65rem; border-radius: var(--radius-full); font-weight: 700;"
                  >
                    ✅ Quét xong
                  </span>

                  <!-- Nút Xóa khỏi hàng chờ -->
                  <button 
                    type="button" 
                    style="background: transparent; color: var(--danger); font-size: 0.8rem; font-weight: 700; cursor: pointer;"
                    @click="removeItem(item.id)"
                    :disabled="item.isSaving || isSavingAll"
                  >
                    Bỏ qua
                  </button>
                </div>
              </div>

              <!-- Nội dung thẻ ảnh lẻ -->
              
              <!-- A. Loading State -->
              <div v-if="item.isLoading" style="display: flex; align-items: center; gap: 1rem; padding: 1.5rem 0;">
                <div class="spinner" style="width: 32px; height: 32px; border-width: 3px;"></div>
                <p style="font-size: 0.9rem; color: var(--text-muted);">Đang chạy Tesseract.js trích xuất câu hỏi & đáp án đúng thông minh...</p>
              </div>

              <!-- B. Error State -->
              <div v-else-if="item.error" style="padding: 1rem 0; display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start;">
                <p style="font-size: 0.9rem; color: var(--danger); font-weight: 500;">⚠️ {{ item.error }}</p>
                <button type="button" class="btn btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;" @click="uploadSingleOcrItem(item)">
                  Thử lại quét OCR
                </button>
              </div>

              <!-- C. Success State: Hiển thị form điền sẵn và ảnh chụp để đối chiếu -->
              <div v-else-if="item.hasResult" class="ocr-preview-container" style="display: grid; grid-template-columns: 1fr; gap: 1.5rem;">
                <!-- Cột trái: Ảnh gốc thu nhỏ -->
                <div style="flex-shrink: 0;">
                  <div class="form-group" style="margin-bottom: 0.5rem;">
                    <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">Ảnh chụp gốc đối chiếu</label>
                    <img :src="item.previewUrl" class="ocr-image-preview" style="max-height: 220px; width: 100%; object-fit: contain; background: var(--bg-main); border: 1px solid var(--border-color-strong); border-radius: var(--radius-md);" alt="Ảnh gốc" />
                  </div>
                </div>

                <!-- Cột phải: Form biên tập nội dung cụ thể cho câu này -->
                <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                  
                  <div class="form-group">
                    <label style="font-size: 0.75rem; font-weight: 700;">Môn Học *</label>
                    <select v-model="item.subjectId" class="form-control" style="padding: 0.55rem 0.75rem; font-size: 0.9rem;" required>
                      <option value="" disabled>-- Chọn môn học --</option>
                      <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
                        {{ subject.name }}
                      </option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label style="font-size: 0.75rem; font-weight: 700;">Nội dung câu hỏi (Quét từ ảnh) *</label>
                    <textarea v-model="item.content" class="form-control" style="height: 90px; font-size: 0.9rem; line-height: 1.4;" required></textarea>
                  </div>

                  <div class="form-group">
                    <label style="font-size: 0.75rem; font-weight: 700;">Đáp án đúng trích xuất *</label>
                    <textarea v-model="item.answer" class="form-control" style="height: 90px; font-size: 0.9rem; line-height: 1.4;" required></textarea>
                  </div>

                  <div class="form-group">
                    <label style="font-size: 0.75rem; font-weight: 700;">Từ khóa / Tags</label>
                    <input v-model="item.tagsInput" type="text" class="form-control" style="padding: 0.55rem 0.75rem; font-size: 0.9rem;" />
                  </div>

                  <!-- Nút lưu riêng lẻ -->
                  <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
                    <button 
                      type="button" 
                      class="btn btn-primary" 
                      style="padding: 0.5rem 1.25rem; font-size: 0.85rem;"
                      :disabled="item.isSaving || isSavingAll"
                      @click="saveSinglePendingItem(item)"
                    >
                      {{ item.isSaving ? '⏳ Đang lưu...' : '💾 Lưu riêng câu này' }}
                    </button>
                  </div>

                </div>
              </div>

            </div>
          </div>

        </div>

      </div>

      <!-- Modal Footer -->
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 2rem;">
        <div>
          <!-- Nút xóa sạch hàng chờ -->
          <button 
            v-if="pendingItems.length > 0"
            type="button" 
            class="btn btn-danger" 
            @click="clearAllQueue"
            :disabled="isSavingAll"
            style="padding: 0.65rem 1.25rem;"
          >
            🗑️ Xóa sạch hàng chờ
          </button>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button type="button" class="btn btn-secondary" @click="closeModal" :disabled="isBusy">
            Đóng Lại
          </button>
          
          <!-- Nút lưu hàng loạt tất cả câu hợp lệ -->
          <button 
            v-if="pendingItems.length > 0" 
            type="button" 
            class="btn btn-primary"
            :disabled="isBusy || pendingItems.length === 0"
            @click="saveAllPendingItems"
            style="background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%); padding: 0.65rem 1.5rem;"
          >
            {{ isSavingAll ? '⏳ Đang nhập hàng loạt...' : isBusy ? '⏳ Đang quét OCR...' : `💾 Lưu tất cả câu hợp lệ (${validItemsCount})` }}
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import api from '../services/api.js';
import { useNotification } from '../composables/useNotification.js';

export default {
  name: 'OcrModal',
  props: {
    isOpen: {
      type: Boolean,
      required: true
    },
    subjects: {
      type: Array,
      required: true
    },
    defaultSubjectId: {
      type: String,
      default: ''
    }
  },
  emits: ['close', 'save', 'refresh'],
  data() {
    return {
      pendingItems: [],
      isSavingAll: false
    };
  },
  computed: {
    // isBusy = true khi đang quét OCR bất kỳ ảnh nào, hoặc đang lưu hàng loạt
    isBusy() {
      return this.isSavingAll || this.pendingItems.some(item => item.isLoading || item.isSaving);
    },
    validItemsCount() {
      return this.pendingItems.filter(item =>
        !item.isLoading &&
        !item.error &&
        this.isItemReadyToSave(item)
      ).length;
    },
    hasValidItemsToSave() {
      return this.validItemsCount > 0;
    }
  },
  watch: {
    subjects: {
      handler() {
        this.ensurePendingSubjects();
      },
      deep: true
    },
    defaultSubjectId() {
      this.ensurePendingSubjects();
    },
    isOpen(newVal) {
      if (!newVal) {
        this.clearAllQueue();
        this.removePasteListener();
      } else {
        this.addPasteListener();
      }
    }
  },
  beforeUnmount() {
    this.removePasteListener();
  },
  methods: {
    getDefaultSubjectId() {
      return this.defaultSubjectId || this.subjects[0]?.id || '';
    },
    isItemReadyToSave(item) {
      return Boolean(
        item
        && item.subjectId
        && item.content
        && item.content.trim()
        && item.answer
        && item.answer.trim()
      );
    },
    ensurePendingSubjects() {
      const fallbackSubjectId = this.getDefaultSubjectId();
      if (!fallbackSubjectId) return;

      this.pendingItems.forEach(item => {
        if (!item.subjectId) {
          item.subjectId = fallbackSubjectId;
        }
      });
    },
    handleFileSelect(e) {
      const files = e.target.files;
      if (files && files.length > 0) {
        this.processMultipleImages(Array.from(files));
      }
      e.target.value = '';
    },
    handleFileDrop(e) {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.processMultipleImages(Array.from(files));
      }
    },
    processMultipleImages(files) {
      files.forEach(file => {
        if (!file.type.match('image.*')) return;

        // Tạo id duy nhất cho từng ảnh
        const id = 'pending_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const item = {
          id,
          file,
          previewUrl: URL.createObjectURL(file),
          isLoading: true,
          hasResult: false,
          isSaving: false,
          error: null,
          subjectId: this.getDefaultSubjectId(),
          content: '',
          answer: '',
          tagsInput: 'ocr'
        };

        this.pendingItems.push(item);
        this.uploadSingleOcrItem(item);
      });
    },
    async uploadSingleOcrItem(item) {
      const targetItem = this.pendingItems.find(i => i.id === item.id) || item;
      targetItem.isLoading = true;
      targetItem.error = null;
      try {
        const response = await api.uploadOcrImage(targetItem.file);
        
        if (response.success && response.data) {
          const parsed = response.data.parsed || {};
          targetItem.subjectId = targetItem.subjectId || this.getDefaultSubjectId();
          targetItem.content = parsed.content || response.data.text || '';
          targetItem.answer = parsed.answer || '';
          if (parsed.tags && parsed.tags.length > 0) {
            targetItem.tagsInput = parsed.tags.join(', ');
          }
          targetItem.hasResult = true;
        } else {
          targetItem.error = response.message || 'Không thể trích xuất văn bản từ hình ảnh này.';
        }
      } catch (error) {
        console.error('Lỗi khi gửi tệp lên chạy OCR:', error);
        targetItem.error = error.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ quét OCR.';
      } finally {
        targetItem.isLoading = false;
      }
    },
    async saveSinglePendingItem(item) {
      const { toast } = useNotification();
      const targetItem = this.pendingItems.find(i => i.id === item.id) || item;
      if (!this.isItemReadyToSave(targetItem)) {
        toast('Vui lòng điền đầy đủ thông tin Môn học, Nội dung câu hỏi và Đáp án trước khi lưu.', 'warning');
        return;
      }
      targetItem.isSaving = true;

      try {
        const tagsString = targetItem.tagsInput || '';
        const parsedTags = typeof tagsString === 'string'
          ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag !== '')
          : [];

        const questionData = {
          subjectId: targetItem.subjectId,
          content: targetItem.content,
          answer: targetItem.answer,
          tags: parsedTags
        };

        const response = await api.createQuestion(questionData);
        if (response.success) {
          // Phát tín hiệu refresh dữ liệu cho Dashboard ngoài
          this.$emit('refresh');
          // Xóa tệp này ra khỏi danh sách chờ
          this.removeItem(targetItem.id);
          toast('Đã lưu câu hỏi thành công!', 'success');
        } else {
          toast('Không thể lưu câu hỏi: ' + (response.message || 'Lỗi không xác định'), 'error');
        }
      } catch (error) {
        console.error('Lỗi khi lưu câu hỏi đơn lẻ:', error);
        toast(error.response?.data?.message || error.message || 'Lỗi hệ thống khi lưu câu hỏi.', 'error');
      } finally {
        targetItem.isSaving = false;
      }
    },
    async saveAllPendingItems() {
      const { toast } = useNotification();
      const validItems = this.pendingItems.filter(item =>
        !item.isLoading &&
        !item.error &&
        this.isItemReadyToSave(item)
      );

      if (validItems.length === 0) {
        toast('Không có câu hỏi nào hợp lệ để lưu. Vui lòng chọn môn học và điền đầy đủ thông tin.', 'warning');
        return;
      }
      this.isSavingAll = true;

      let successCount = 0;
      for (const item of validItems) {
        try {
          const tagsString = item.tagsInput || '';
          const parsedTags = typeof tagsString === 'string'
            ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag !== '')
            : [];

          const questionData = {
            subjectId: item.subjectId,
            content: item.content,
            answer: item.answer,
            tags: parsedTags
          };

          const response = await api.createQuestion(questionData);
          if (response.success) {
            this.removeItem(item.id);
            successCount++;
          } else {
            console.warn(`Lỗi lưu câu hỏi cho ảnh ${item.file.name}: ${response.message}`);
          }
        } catch (error) {
          console.error(`Lỗi hệ thống lưu hàng loạt câu hỏi cho ảnh ${item.file.name}:`, error);
        }
      }

      // Phát sự kiện reload lại Dashboard bên ngoài
      this.$emit('refresh');

      toast(`Đã lưu hàng loạt thành công ${successCount}/${validItems.length} câu hỏi vào ngân hàng đề!`, 'success');
      this.isSavingAll = false;
      
      if (this.pendingItems.length === 0) {
        this.closeModal();
      }
    },
    removeItem(id) {
      const index = this.pendingItems.findIndex(item => item.id === id);
      if (index !== -1) {
        const item = this.pendingItems[index];
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
        this.pendingItems.splice(index, 1);
      }
    },
    clearAllQueue() {
      this.pendingItems.forEach(item => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      this.pendingItems = [];
    },
    closeModal() {
      if (!this.isBusy) {
        this.$emit('close');
      }
    },
    handleBackdropClick(e) {
      if (e.target !== e.currentTarget) return;
      if (this.isBusy) {
        // Hiển thị thông báo tạm khi đang bận
        this.showBusyWarning();
        return;
      }
      this.$emit('close');
    },
    showBusyWarning() {
      // Nháy hiệu backdrop màu cam để nhắc người dùng hệ thống đang bận
      const backdrop = document.querySelector('.modal-backdrop');
      if (!backdrop) return;
      backdrop.style.transition = 'background 0.15s';
      backdrop.style.background = 'rgba(245, 158, 11, 0.25)';
      setTimeout(() => {
        backdrop.style.background = '';
      }, 500);
    },
    triggerFileInput() {
      this.$refs.fileInput && this.$refs.fileInput.click();
    },
    addPasteListener() {
      window.addEventListener('paste', this.handlePaste);
    },
    removePasteListener() {
      window.removeEventListener('paste', this.handlePaste);
    },
    handlePaste(e) {
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;

      const imageFiles = [];
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const file = item.getAsFile();
          if (file) {
            // Đặt tên tệp ảo cho clipboard dán
            const imageFile = new File([file], `pasted-image-${Date.now()}-${imageFiles.length + 1}.png`, { type: file.type });
            imageFiles.push(imageFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        this.processMultipleImages(imageFiles);
        e.preventDefault();
      }
    }
  }
};
</script>

<style scoped>
/* Spinner nhỏ cho hàng chờ lẻ */
.spinner {
  border: 3px solid var(--primary-light);
  border-top: 3px solid var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (min-width: 768px) {
  .ocr-preview-container {
    grid-template-columns: 240px 1fr !important;
  }
}
</style>
