<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-content pdf-export-modal-content">
      <div class="modal-header">
        <h3>Xuất Câu Hỏi Ra PDF</h3>
        <button class="close-btn" type="button" @click="$emit('close')">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="pdfExportSubject">Môn học</label>
          <select id="pdfExportSubject" v-model="selectedSubjectId" class="form-control">
            <option value="">Tất cả môn học</option>
            <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
              {{ subject.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="pdfExportQuiz">Dạng bài tập</label>
          <select id="pdfExportQuiz" v-model="selectedQuizName" class="form-control">
            <option value="">Tất cả dạng bài tập</option>
            <option v-for="quizName in availableQuizNames" :key="quizName" :value="quizName">
              {{ quizName }}
            </option>
          </select>
        </div>

        <div class="pdf-export-summary">
          <strong>Nội dung file PDF</strong>
          <span>Mỗi mục gồm số câu, nội dung câu hỏi, hình ảnh và đáp án.</span>
          <span>Dữ liệu được nhóm theo môn học và dạng bài tập, có đánh số trang.</span>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" :disabled="isExporting" @click="$emit('close')">
          Hủy Bỏ
        </button>
        <button type="button" class="btn btn-primary" :disabled="isExporting" @click="submitExport">
          {{ isExporting ? 'Đang tạo file PDF...' : 'Xuất file PDF' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PdfExportModal',
  props: {
    isOpen: {
      type: Boolean,
      required: true
    },
    subjects: {
      type: Array,
      required: true
    },
    quizNamesBySubject: {
      type: Object,
      default: () => ({})
    },
    defaultSubjectId: {
      type: String,
      default: ''
    },
    isExporting: {
      type: Boolean,
      default: false
    }
  },
  emits: ['close', 'export'],
  data() {
    return {
      selectedSubjectId: '',
      selectedQuizName: ''
    };
  },
  computed: {
    availableQuizNames() {
      const names = this.selectedSubjectId
        ? this.quizNamesBySubject[this.selectedSubjectId] || []
        : Object.values(this.quizNamesBySubject).flat();
      return [...new Set(names)].sort((first, second) => first.localeCompare(second, 'vi'));
    }
  },
  watch: {
    isOpen(isOpen) {
      if (!isOpen) return;
      this.selectedSubjectId = this.defaultSubjectId || '';
      this.selectedQuizName = '';
    },
    selectedSubjectId() {
      this.selectedQuizName = '';
    }
  },
  methods: {
    submitExport() {
      this.$emit('export', {
        subjectId: this.selectedSubjectId,
        quizName: this.selectedQuizName
      });
    }
  }
};
</script>

<style scoped>
.pdf-export-modal-content {
  max-width: 560px;
}

.pdf-export-summary {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  background: var(--bg-soft);
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.pdf-export-summary strong {
  color: var(--text-main);
}
</style>
