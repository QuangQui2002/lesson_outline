<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-content question-modal-content">
      
      <!-- Tiêu đề Modal -->
      <div class="modal-header">
        <h3>{{ isEditMode ? 'Cập Nhật Câu Hỏi' : 'Thêm Câu Hỏi Mới' }}</h3>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <!-- Form nhập liệu -->
      <form class="question-modal-form" @submit.prevent="submitForm">
        <div class="modal-body">
          
          <!-- Lựa chọn môn học -->
          <div class="form-group">
            <label for="subjectSelect">Môn Học *</label>
            <select 
              id="subjectSelect" 
              v-model="formData.subjectId" 
              class="form-control"
              required
            >
              <option value="" disabled>-- Chọn môn học --</option>
              <option 
                v-for="subject in subjects" 
                :key="subject.id" 
                :value="subject.id"
              >
                {{ subject.name }}
              </option>
            </select>
          </div>

          <!-- Nội dung câu hỏi -->
          <div class="form-group">
            <label for="questionContent">Nội Dung Câu Hỏi *</label>
            <textarea 
              id="questionContent" 
              v-model="formData.content" 
              class="form-control" 
              placeholder="Nhập nội dung câu hỏi..." 
              required
            ></textarea>
          </div>

          <!-- Đáp án -->
          <div class="form-group">
            <label for="questionAnswer">Đáp Án Chi Tiết *</label>
            <textarea 
              id="questionAnswer" 
              v-model="formData.answer" 
              class="form-control" 
              placeholder="Nhập đáp án chi tiết..." 
              required
            ></textarea>
          </div>

          <!-- Từ khóa (Tags) -->
          <div class="form-group">
            <label for="questionTags">Từ khóa / Tags</label>
            <input 
              id="questionTags" 
              v-model="tagsInput" 
              type="text" 
              class="form-control" 
              placeholder="Cách nhau bằng dấu phẩy, ví dụ: giải tích, giới hạn, toán 1"
            />
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              Từ khóa giúp tìm kiếm nhanh chóng và phân loại câu hỏi tốt hơn.
            </span>
          </div>

        </div>

        <!-- Các nút bấm ở chân trang -->
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">
            Hủy Bỏ
          </button>
          <button type="submit" class="btn btn-primary">
            {{ isEditMode ? 'Cập Nhật' : 'Lưu Lại' }}
          </button>
        </div>
      </form>

    </div>
  </div>
</template>

<script>
export default {
  name: 'QuestionModal',
  props: {
    isOpen: {
      type: Boolean,
      required: true
    },
    subjects: {
      type: Array,
      required: true
    },
    question: {
      type: Object,
      default: null
    },
    defaultSubjectId: {
      type: String,
      default: ''
    }
  },
  emits: ['close', 'save'],
  data() {
    return {
      formData: {
        id: null,
        subjectId: '',
        content: '',
        answer: '',
        tags: []
      },
      tagsInput: ''
    };
  },
  computed: {
    isEditMode() {
      return !!(this.question && this.question.id);
    }
  },
  watch: {
    isOpen(newVal) {
      if (newVal) {
        this.resetForm();
      }
    }
  },
  methods: {
    resetForm() {
      if (this.question) {
        // Mode chỉnh sửa: Load thông tin cũ lên form
        this.formData = {
          id: this.question.id,
          subjectId: this.question.subjectId,
          content: this.question.content,
          answer: this.question.answer,
          tags: [...(this.question.tags || [])]
        };
        this.tagsInput = (this.question.tags || []).join(', ');
      } else {
        // Mode thêm mới: Tạo form rỗng
        this.formData = {
          id: null,
          subjectId: this.defaultSubjectId || '',
          content: '',
          answer: '',
          tags: []
        };
        this.tagsInput = '';
      }
    },
    submitForm() {
      // Phân tách tags từ chuỗi text
      const parsedTags = this.tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag !== '');

      this.formData.tags = parsedTags;

      this.$emit('save', { ...this.formData });
    }
  }
};
</script>
