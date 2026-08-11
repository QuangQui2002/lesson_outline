<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-content word-export-modal-content">
      <div class="modal-header">
        <h3>Xuất Câu Hỏi Ra Word</h3>
        <button class="close-btn" type="button" @click="$emit('close')">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="wordExportSubject">Môn học</label>
          <select id="wordExportSubject" v-model="selectedSubjectId" class="form-control">
            <option value="">Tất cả môn học</option>
            <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
              {{ subject.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="wordExportQuiz">Dạng bài tập</label>
          <select id="wordExportQuiz" v-model="selectedQuizName" class="form-control">
            <option value="">Tất cả dạng bài tập</option>
            <option v-for="quizName in availableQuizNames" :key="quizName" :value="quizName">
              {{ quizName }}
            </option>
          </select>
        </div>

        <div class="word-export-summary">
          <strong>Nội dung file Word</strong>
          <span>Mỗi mục gồm số câu, nội dung câu hỏi và đáp án.</span>
          <span>Dữ liệu được nhóm theo môn học và dạng bài tập.</span>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" :disabled="isExporting" @click="$emit('close')">
          Hủy Bỏ
        </button>
        <button type="button" class="btn btn-primary" :disabled="isExporting" @click="submitExport">
          {{ isExporting ? 'Đang tạo file Word...' : 'Xuất file Word' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WordExportModal',
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
.word-export-modal-content {
  max-width: 560px;
}

.word-export-summary {
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

.word-export-summary strong {
  color: var(--text-main);
}
</style>
