<template>
  <DefaultLayout 
    @open-ocr="openOcrModal"
    @open-add="openAddQuestionModal"
    @import-json="triggerJsonImport"
    @export-json="exportQuestionsJson"
  >
    <!-- Slot danh sách môn học cho Sidebar -->
    <template #sidebar>
      <SubjectList
        :subjects="subjects"
        :active-subject-id="activeSubjectId"
        :question-counts="questionCounts"
        @select-subject="selectSubject"
        @add-subject="handleAddSubject"
        @delete-subject="handleDeleteSubject"
      />
    </template>

    <!-- Nội dung chính: Thống kê & Ô tìm kiếm & Danh sách câu hỏi -->
    <div>
      <input
        ref="jsonImportInput"
        type="file"
        accept="application/json,.json"
        style="display: none;"
        @change="handleJsonImportFile"
      />

      <!-- Modal Import JSON -->
      <div v-if="isJsonImportModalOpen" class="modal-backdrop" @click.self="closeJsonImportModal">
        <div class="modal-content json-import-modal-content">
          <div class="modal-header">
            <h3>Import Câu Hỏi Từ JSON</h3>
            <button class="close-btn" @click="closeJsonImportModal">&times;</button>
          </div>

          <div class="modal-body">
            <div class="import-json-actions">
              <button type="button" class="btn btn-secondary" @click="chooseJsonFile">📁 Chọn file JSON</button>
              <span style="font-size: 0.85rem; color: var(--text-muted);">hoặc dán JSON trực tiếp bên dưới</span>
            </div>

            <div class="form-group">
              <label for="jsonImportTextarea">Nội dung JSON</label>
              <textarea
                id="jsonImportTextarea"
                v-model="jsonImportText"
                class="form-control json-import-textarea"
                placeholder='{ "questions": [ { "questiontext": "...", "answertext": [], "generalfeedback": "..." } ] }'
              ></textarea>
            </div>

            <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">
              JSON cần có mảng <code>questions</code>. Mỗi câu hỏi sẽ lấy <code>questiontext</code>, các <code>answertext[].answer</code> và <code>generalfeedback</code>.
            </p>

            <div v-if="jsonImportPreview" class="import-preview-panel">
              <div class="import-preview-grid">
                <div><strong>{{ jsonImportPreview.totalCount }}</strong><span>Tổng câu</span></div>
                <div><strong>{{ jsonImportPreview.importableCount }}</strong><span>Hợp lệ</span></div>
                <div><strong>{{ jsonImportPreview.missingRequiredCount }}</strong><span>Thiếu nội dung/đáp án</span></div>
                <div><strong>{{ jsonImportPreview.duplicateCount }}</strong><span>Bị trùng</span></div>
              </div>

              <div v-if="jsonImportPreview.skipped?.length" class="import-preview-skipped">
                <strong>Câu bị bỏ qua</strong>
                <ul>
                  <li v-for="item in jsonImportPreview.skipped.slice(0, 8)" :key="item.index + '-' + item.reason">
                    #{{ item.slot || item.index + 1 }}: {{ item.reason }}
                    <span v-if="item.similarity">({{ Math.round(item.similarity * 100) }}% giống)</span>
                  </li>
                </ul>
                <small v-if="jsonImportPreview.skipped.length > 8">Còn {{ jsonImportPreview.skipped.length - 8 }} câu khác...</small>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeJsonImportModal">Hủy Bỏ</button>
            <button type="button" class="btn btn-secondary" :disabled="isImportingJson" @click="previewJsonFromText">
              {{ isImportingJson ? '⏳ Đang kiểm tra...' : 'Preview JSON' }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isImportingJson || !jsonImportPreview || jsonImportPreview.importableCount === 0"
              @click="confirmImportJson"
            >
              {{ isImportingJson ? '⏳ Đang import...' : `Import ${jsonImportPreview?.importableCount || 0} câu hợp lệ` }}
            </button>
          </div>
        </div>
      </div>

      <!-- Thanh tìm kiếm thời gian thực -->
      <section class="search-wrapper">
        <div class="search-input-container">
          <span class="search-icon">🔍</span>
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="Tìm kiếm nhanh theo nội dung câu hỏi, đáp án hoặc từ khóa (tags)..." 
            class="search-input"
          />
        </div>
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear-btn"
          title="Xoa noi dung tim kiem"
          aria-label="Xoa noi dung tim kiem"
          @click="searchQuery = ''"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </section>

      <!-- Danh sách câu hỏi lọc theo môn học & tìm kiếm -->
      <section>
        <div v-if="isLoading" class="ocr-loading-container" style="padding: 5rem 0;">
          <div class="spinner"></div>
          <p style="color: var(--text-muted);">Đang tải câu hỏi...</p>
        </div>
        <QuestionList
          v-else
          :questions="filteredQuestions"
          :subjects="subjects"
          @edit-question="openEditQuestionModal"
          @delete-question="handleDeleteQuestion"
        />
      </section>

      <!-- Modal Thêm/Sửa câu hỏi -->
      <QuestionModal
        :is-open="isQuestionModalOpen"
        :subjects="subjects"
        :question="editingQuestion"
        :default-subject-id="activeSubjectId"
        @close="closeQuestionModal"
        @save="handleSaveQuestion"
      />

      <!-- Modal quét ảnh OCR -->
      <OcrModal
        :is-open="isOcrModalOpen"
        :subjects="subjects"
        :default-subject-id="activeSubjectId"
        @close="closeOcrModal"
        @save="handleSaveQuestion"
        @refresh="handleOcrRefresh"
      />

    </div>
  </DefaultLayout>
</template>

<script>
import DefaultLayout from '../layouts/DefaultLayout.vue';
import SubjectList from '../components/SubjectList.vue';
import QuestionList from '../components/QuestionList.vue';
import QuestionModal from '../components/QuestionModal.vue';
import OcrModal from '../components/OcrModal.vue';
import api from '../services/api.js';
import { useNotification } from '../composables/useNotification.js';

export default {
  name: 'Dashboard',
  components: {
    DefaultLayout,
    SubjectList,
    QuestionList,
    QuestionModal,
    OcrModal
  },
  data() {
    return {
      subjects: [],
      questionStats: { total: 0, countsBySubject: {} },
      filteredQuestions: [], // Danh sách câu hỏi hiển thị sau lọc/search
      activeSubjectId: null,
      searchQuery: '',
      isLoading: false,
      isQuestionModalOpen: false,
      isOcrModalOpen: false,
      isJsonImportModalOpen: false,
      isImportingJson: false,
      jsonImportText: '',
      jsonImportPreview: null,
      editingQuestion: null
    };
  },
  computed: {
    totalQuestions() {
      return this.questionStats.total;
    },
    ocrQuestionsCount() {
      return 0;
    },
    // Tính toán số lượng câu hỏi trên mỗi môn học
    questionCounts() {
      const counts = { ...(this.questionStats.countsBySubject || {}) };

      this.subjects.forEach(subject => {
        if (typeof subject.questionCount === 'number') {
          counts[subject.id] = subject.questionCount;
        }
      });

      return counts;
    }
  },
  watch: {
    // Theo dõi ô tìm kiếm để fetch dữ liệu thời gian thực từ API
    searchQuery() {
      this.loadQuestions();
    },
    // Theo dõi môn học đang chọn để fetch dữ liệu từ API
    activeSubjectId() {
      this.loadQuestions();
    }
  },
  created() {
    this.loadInitialData();
  },
  methods: {
    async loadInitialData() {
      this.isLoading = true;
      try {
        await this.loadSubjects();
        if (!this.activeSubjectId && this.subjects.length > 0) {
          this.activeSubjectId = this.subjects[0].id;
        }
        await Promise.all([
          this.loadQuestionStats(),
          this.loadQuestions()
        ]);
      } catch (error) {
        console.error('Lỗi khi tải dữ liệu ban đầu:', error);
      } finally {
        this.isLoading = false;
      }
    },
    async loadSubjects() {
      const response = await api.getSubjects();
      if (response.success) {
        this.subjects = response.data;
      }
    },
    async loadQuestionStats() {
      try {
        const response = await api.getQuestionStats();
        if (response.success) {
          this.questionStats = response.data;
        }
      } catch (error) {
        const countsBySubject = {};
        let total = 0;

        this.subjects.forEach(subject => {
          const count = subject.questionCount || 0;
          countsBySubject[subject.id] = count;
          total += count;
        });

        this.questionStats = { total, countsBySubject };
      }
    },
    // Lấy câu hỏi hiển thị có lọc theo môn học & tìm kiếm
    async loadQuestions() {
      try {
        if (!this.activeSubjectId) {
          this.filteredQuestions = [];
          return;
        }
        const response = await api.getQuestions(this.activeSubjectId, this.searchQuery);
        if (response.success) {
          this.filteredQuestions = response.data;
        }
      } catch (error) {
        console.error('Lỗi tải câu hỏi:', error);
      }
    },
    selectSubject(subjectId) {
      this.activeSubjectId = subjectId;
    },
    exportQuestionsJson() {
      const { toast } = useNotification();
      if (this.filteredQuestions.length === 0) {
        toast('Không có câu hỏi để xuất JSON.', 'warning');
        return;
      }

      const activeSubject = this.subjects.find(subject => subject.id === this.activeSubjectId);
      const exportData = {
        exportedAt: new Date().toISOString(),
        subject: activeSubject || null,
        search: this.searchQuery.trim(),
        total: this.filteredQuestions.length,
        questions: this.filteredQuestions
      };
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const subjectName = activeSubject?.name || 'questions';
      const safeSubjectName = subjectName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'questions';

      link.href = url;
      link.download = `${safeSubjectName}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast(`Đã xuất ${this.filteredQuestions.length} câu hỏi ra JSON.`, 'success');
    },
    async handleAddSubject(name) {
      const { toast } = useNotification();
      try {
        const response = await api.createSubject(name);
        if (response.success) {
          await this.loadSubjects();
          this.activeSubjectId = response.data.id;
          toast(`Đã thêm môn học "${name}" thành công!`, 'success');
        }
      } catch (error) {
        toast(error.response?.data?.message || 'Không thể tạo môn học mới.', 'error');
      }
    },
    async handleDeleteSubject(id) {
      const { toast } = useNotification();
      try {
        const response = await api.deleteSubject(id);
        if (response.success) {
          if (this.activeSubjectId === id) {
            this.activeSubjectId = this.subjects.find(subject => subject.id !== id)?.id || null;
          }
          await Promise.all([
            this.loadSubjects(),
            this.loadQuestionStats(),
            this.loadQuestions()
          ]);
          toast('Đã xóa môn học thành công!', 'success');
        }
      } catch (error) {
        toast('Có lỗi xảy ra khi xóa môn học.', 'error');
      }
    },
    triggerJsonImport() {
      const { toast } = useNotification();
      if (!this.activeSubjectId) {
        toast('Vui lòng chọn một môn học ở sidebar trước khi import JSON.', 'warning');
        return;
      }
      this.isJsonImportModalOpen = true;
    },
    closeJsonImportModal() {
      if (this.isImportingJson) return;
      this.isJsonImportModalOpen = false;
      this.jsonImportText = '';
      this.jsonImportPreview = null;
    },
    chooseJsonFile() {
      this.$refs.jsonImportInput && this.$refs.jsonImportInput.click();
    },
    async handleJsonImportFile(event) {
      const { toast } = useNotification();
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        this.jsonImportText = await file.text();
        await this.previewJsonFromText();
      } catch (error) {
        toast('Không thể đọc file JSON.', 'error');
      }
    },
    async previewJsonFromText() {
      const { toast } = useNotification();
      if (!this.jsonImportText.trim()) {
        toast('Vui lòng chọn file JSON hoặc dán nội dung JSON trước khi import.', 'warning');
        return;
      }

      this.isImportingJson = true;
      try {
        const importData = JSON.parse(this.jsonImportText);
        const response = await api.previewImportQuestions(this.activeSubjectId, importData);

        if (response.success) {
          this.jsonImportPreview = response.data;
          toast(`Preview xong: ${response.data.importableCount} câu hợp lệ, ${response.data.skippedCount} câu bị bỏ qua.`, 'success');
        }
      } catch (error) {
        const message = error instanceof SyntaxError
          ? 'JSON không đúng định dạng. Vui lòng kiểm tra lại dấu ngoặc, dấu phẩy và cấu trúc questions.'
          : error.response?.data?.message || 'Không thể import JSON.';
        toast(message, 'error');
      } finally {
        this.isImportingJson = false;
      }
    },
    async confirmImportJson() {
      const { toast } = useNotification();
      if (!this.jsonImportPreview) {
        toast('Vui lòng preview JSON trước khi import.', 'warning');
        return;
      }

      this.isImportingJson = true;
      try {
        const importData = JSON.parse(this.jsonImportText);
        const response = await api.importQuestions(this.activeSubjectId, importData);

        if (response.success) {
          const importedCount = response.data?.importedCount || 0;
          const skippedCount = response.data?.skippedCount || 0;
          await Promise.all([
            this.loadQuestionStats(),
            this.loadQuestions()
          ]);
          const skippedMessage = skippedCount ? `, bỏ qua ${skippedCount} câu không hợp lệ` : '';
          toast(`Import thành công ${importedCount} câu hỏi${skippedMessage}.`, 'success');
          this.closeJsonImportModal();
        }
      } catch (error) {
        toast(error.response?.data?.message || 'Không thể import JSON.', 'error');
      } finally {
        this.isImportingJson = false;
      }
    },
    async handleSaveQuestion(questionData) {
      const { toast } = useNotification();
      try {
        let response;
        if (questionData.id) {
          // Mode Update
          response = await api.updateQuestion(questionData.id, questionData);
        } else {
          // Mode Create
          response = await api.createQuestion(questionData);
        }

        if (response.success) {
          toast(questionData.id ? 'Cập nhật câu hỏi thành công!' : 'Thêm câu hỏi mới thành công!', 'success');
          this.closeQuestionModal();
          this.closeOcrModal();
          // Reload data
          await Promise.all([
            this.loadQuestionStats(),
            this.loadQuestions()
          ]);
        }
      } catch (error) {
        toast(error.response?.data?.message || 'Không thể lưu câu hỏi.', 'error');
      }
    },
    async handleDeleteQuestion(id) {
      const { toast } = useNotification();
      try {
        const response = await api.deleteQuestion(id);
        if (response.success) {
          await Promise.all([
            this.loadQuestionStats(),
            this.loadQuestions()
          ]);
          toast('Đã xóa câu hỏi thành công!', 'success');
        }
      } catch (error) {
        toast('Không thể xóa câu hỏi.', 'error');
      }
    },
    openAddQuestionModal() {
      this.editingQuestion = null;
      this.isQuestionModalOpen = true;
    },
    openEditQuestionModal(question) {
      this.editingQuestion = question;
      this.isQuestionModalOpen = true;
    },
    closeQuestionModal() {
      this.isQuestionModalOpen = false;
      this.editingQuestion = null;
    },
    openOcrModal() {
      this.isOcrModalOpen = true;
    },
    closeOcrModal() {
      this.isOcrModalOpen = false;
    },
    async handleOcrRefresh() {
      await Promise.all([
        this.loadQuestionStats(),
        this.loadQuestions()
      ]);
    }
  }
};
</script>


<style scoped>
.import-preview-panel {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem;
  background: var(--bg-soft);
}

.import-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.import-preview-grid div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
}

.import-preview-grid strong {
  font-size: 1.4rem;
  color: var(--primary);
}

.import-preview-grid span,
.import-preview-skipped small {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.import-preview-skipped {
  margin-top: 1rem;
  font-size: 0.9rem;
}

.import-preview-skipped ul {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
}
</style>
