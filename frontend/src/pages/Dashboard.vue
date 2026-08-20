<template>
  <DefaultLayout 
    @open-add="openAddQuestionModal"
    @import-json="triggerJsonImport"
    @export-json="exportQuestionsJson"
    @export-pdf="openPdfExportModal"
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
      <HamsterLoading v-if="showGlobalLoading" :message="loadingMessage" />
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

      <PdfExportModal
        :is-open="isPdfExportModalOpen"
        :subjects="subjects"
        :quiz-names-by-subject="questionStats.quizNamesBySubject"
        :default-subject-id="activeSubjectId || ''"
        :is-exporting="isExportingPdf"
        @close="closePdfExportModal"
        @export="exportQuestionsPdf"
      />


      <section class="extension-download-card extension-download-card--compact mobile-hidden">
        <div class="extension-download-card__content">
          <span class="extension-download-card__kicker">Extension LMS TVU</span>
          <h3>Tải Extension LMS</h3>
          <p>Phiên bản mới nhất: <strong>{{ extensionInfo.version }}</strong> • {{ extensionInfo.note }}</p>
        </div>
        <a class="btn btn-primary extension-download-card__button" :href="extensionInfo.downloadUrl" download>
          Tải extension mới nhất
        </a>
      </section>

      <!-- Thanh tìm kiếm thời gian thực -->
      <section class="search-wrapper">
        <div class="search-input-container">
          <span class="search-icon">🔍</span>
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="Tìm theo nội dung câu hỏi hoặc đáp án (hỗ trợ không dấu)..."
            class="search-input"
          />
        </div>
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear-btn"
          title="Xóa nội dung tìm kiếm"
          aria-label="Xóa nội dung tìm kiếm"
          @click="searchQuery = ''"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </section>

      <section v-if="activeSubjectId" class="quiz-filter-wrapper">
        <label for="quizFilter">Bài tập</label>
        <select id="quizFilter" v-model="activeQuizName" class="form-control quiz-filter-select">
          <option value="">Tất cả</option>
          <option v-for="quizName in activeQuizNames" :key="quizName" :value="quizName">
            {{ quizName }}
          </option>
        </select>
      </section>

      <!-- Danh sách câu hỏi lọc theo môn học & tìm kiếm -->
      <section>
        <HamsterLoading v-if="isLoading || (isQuestionLoading && filteredQuestions.length === 0)" message="Đang tải câu hỏi..." inline />
        <QuestionList
          v-else
          :questions="filteredQuestions"
          :subjects="subjects"
          :total="questionTotal"
          :is-loading="isQuestionLoading"
          :has-more="hasMoreQuestions"
          @edit-question="openEditQuestionModal"
          @delete-question="handleDeleteQuestion"
          @load-more="loadMoreQuestions"
        />
      </section>

      <!-- Modal Thêm/Sửa câu hỏi -->
      <QuestionModal
        :is-open="isQuestionModalOpen"
        :subjects="subjects"
        :question="editingQuestion"
        :default-subject-id="activeSubjectId"
        :quiz-names="activeQuizNames"
        @close="closeQuestionModal"
        @save="handleSaveQuestion"
      />

    </div>
  </DefaultLayout>
</template>

<script>
import DefaultLayout from '../layouts/DefaultLayout.vue';
import SubjectList from '../components/SubjectList.vue';
import QuestionList from '../components/QuestionList.vue';
import QuestionModal from '../components/QuestionModal.vue';
import HamsterLoading from '../components/HamsterLoading.vue';
import PdfExportModal from '../components/PdfExportModal.vue';
import api from '../services/api.js';
import { createQuestionsPdfBlob } from '../services/pdfExport.js';
import { useNotification } from '../composables/useNotification.js';

export default {
  name: 'Dashboard',
  components: {
    DefaultLayout,
    SubjectList,
    QuestionList,
    QuestionModal,
    HamsterLoading,
    PdfExportModal
  },
  data() {
    return {
      subjects: [],
      questionStats: { total: 0, countsBySubject: {} },
      filteredQuestions: [], // Danh sách câu hỏi hiển thị sau lọc/search
      questionTotal: 0,
      questionPageSize: 20,
      isQuestionLoading: false,
      questionRequestId: 0,
      questionAbortController: null,
      searchDebounceTimer: null,
      hasInitialized: false,
      activeSubjectId: null,
      activeQuizName: '',
      searchQuery: '',
      isLoading: false,
      isActionLoading: false,
      loadingMessage: '',
      isQuestionModalOpen: false,
      isJsonImportModalOpen: false,
      isImportingJson: false,
      isPdfExportModalOpen: false,
      isExportingPdf: false,
      jsonImportText: '',
      jsonImportPreview: null,
      extensionInfo: {
        version: '1.0.12',
        downloadUrl: '/downloads/support_lms_extension.zip',
        note: 'Hỗ trợ select, bài đọc hiểu nhiều câu nhỏ và kiểm tra trùng theo cả hình ảnh.'
      },
      editingQuestion: null
    };
  },
  computed: {
    showGlobalLoading() {
      return this.isActionLoading || this.isImportingJson || this.isExportingPdf;
    },
    totalQuestions() {
      return this.questionStats.total;
    },
    // Tính toán số lượng câu hỏi trên mỗi môn học
    activeQuizNames() {
      return this.questionStats.quizNamesBySubject?.[this.activeSubjectId] || [];
    },
    questionCounts() {
      const counts = { ...(this.questionStats.countsBySubject || {}) };

      this.subjects.forEach(subject => {
        if (typeof subject.questionCount === 'number') {
          counts[subject.id] = subject.questionCount;
        }
      });

      return counts;
    },
    hasMoreQuestions() {
      return this.filteredQuestions.length < this.questionTotal;
    }
  },
  watch: {
    // Theo dõi ô tìm kiếm để fetch dữ liệu thời gian thực từ API
    searchQuery() {
      if (!this.hasInitialized) return;
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => this.loadQuestions(), 300);
    },
    // Theo dõi môn học đang chọn để fetch dữ liệu từ API
    activeSubjectId() {
      clearTimeout(this.searchDebounceTimer);
      const quizWillReset = Boolean(this.activeQuizName);
      this.activeQuizName = '';
      if (!this.hasInitialized) return;
      if (!quizWillReset) this.loadQuestions();
    },
    activeQuizName() {
      if (!this.hasInitialized) return;
      clearTimeout(this.searchDebounceTimer);
      this.loadQuestions();
    }
  },
  created() {
    this.loadInitialData();
  },
  beforeUnmount() {
    clearTimeout(this.searchDebounceTimer);
    this.questionAbortController?.abort();
  },
  methods: {
    async loadInitialData() {
      this.isLoading = true;
      this.loadingMessage = 'Đang tải dữ liệu...';
      try {
        await this.loadSubjects();
        if (!this.activeSubjectId && this.subjects.length > 0) {
          this.activeSubjectId = this.subjects[0].id;
        }
        this.hasInitialized = true;
        await Promise.all([
          this.loadQuestionStats(),
          this.loadQuestions()
        ]);
      } catch (error) {
        console.error('Lỗi khi tải dữ liệu ban đầu:', error);
      } finally {
        this.isLoading = false;
        this.loadingMessage = '';
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

        this.questionStats = { total, countsBySubject, quizNamesBySubject: {} };
      }
    },
    // Lấy câu hỏi hiển thị có lọc theo môn học & tìm kiếm
    async loadQuestions({ append = false } = {}) {
      if (this.isQuestionLoading && append) return;
      const requestId = ++this.questionRequestId;
      this.questionAbortController?.abort();
      this.questionAbortController = new AbortController();
      this.isQuestionLoading = true;
      try {
        if (!this.activeSubjectId) {
          this.filteredQuestions = [];
          this.questionTotal = 0;
          return;
        }
        const offset = append ? this.filteredQuestions.length : 0;
        const response = await api.getQuestions(
          this.activeSubjectId,
          this.searchQuery,
          this.activeQuizName,
          {
            limit: this.questionPageSize,
            offset,
            signal: this.questionAbortController.signal
          }
        );
        if (requestId !== this.questionRequestId) return;
        if (response.success) {
          this.filteredQuestions = append
            ? [...this.filteredQuestions, ...response.data]
            : response.data;
          this.questionTotal = response.pagination?.total ?? this.filteredQuestions.length;
        }
      } catch (error) {
        if (error.code === 'ERR_CANCELED') return;
        console.error('Lỗi tải câu hỏi:', error);
      } finally {
        if (requestId === this.questionRequestId) this.isQuestionLoading = false;
      }
    },
    loadMoreQuestions() {
      if (this.hasMoreQuestions) this.loadQuestions({ append: true });
    },
    selectSubject(subjectId) {
      this.activeSubjectId = subjectId;
    },
    async exportQuestionsJson() {
      const { toast } = useNotification();
      let questionsToExport = this.filteredQuestions;
      if (this.questionTotal > this.filteredQuestions.length) {
        this.isActionLoading = true;
        this.loadingMessage = 'Đang chuẩn bị file JSON...';
        try {
          const response = await api.getQuestions(this.activeSubjectId, this.searchQuery, this.activeQuizName);
          if (response.success) questionsToExport = response.data;
        } catch (error) {
          toast(error.response?.data?.message || 'Không thể tải dữ liệu để xuất JSON.', 'error');
          return;
        } finally {
          this.isActionLoading = false;
          this.loadingMessage = '';
        }
      }
      if (questionsToExport.length === 0) {
        toast('Không có câu hỏi để xuất JSON.', 'warning');
        return;
      }

      const activeSubject = this.subjects.find(subject => subject.id === this.activeSubjectId);
      const exportData = {
        exportedAt: new Date().toISOString(),
        subject: activeSubject || null,
        search: this.searchQuery.trim(),
        total: questionsToExport.length,
        questions: questionsToExport
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
      toast(`Đã xuất ${questionsToExport.length} câu hỏi ra JSON.`, 'success');
    },
    openPdfExportModal() {
      this.isPdfExportModalOpen = true;
    },
    closePdfExportModal() {
      if (this.isExportingPdf) return;
      this.isPdfExportModalOpen = false;
    },
    async fetchQuestionsForPdfExport(subjectId, quizName) {
      const questions = [];
      const limit = 200;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await api.getQuestions(subjectId || null, '', quizName || '', { limit, offset });
        if (!response.success) throw new Error('Không tải được dữ liệu câu hỏi.');
        questions.push(...response.data);
        offset += response.data.length;
        hasMore = Boolean(response.pagination?.hasMore) && response.data.length > 0;
      }

      return questions;
    },
    toSafeFilename(value, fallback = 'questions') {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || fallback;
    },
    async exportQuestionsPdf({ subjectId, quizName }) {
      const { toast } = useNotification();
      const subject = this.subjects.find(item => item.id === subjectId);
      const subjectLabel = subject?.name || 'Tất cả môn học';
      const quizLabel = quizName || 'Tất cả dạng bài tập';

      this.isExportingPdf = true;
      this.loadingMessage = 'Đang tải dữ liệu và tạo file PDF...';
      try {
        const questions = await this.fetchQuestionsForPdfExport(subjectId, quizName);
        if (questions.length === 0) {
          toast('Không có câu hỏi phù hợp để xuất PDF.', 'warning');
          return;
        }

        const subjectNames = Object.fromEntries(this.subjects.map(item => [item.id, item.name]));
        const blob = await createQuestionsPdfBlob({
          questions,
          subjectNames,
          subjectLabel,
          quizLabel
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const subjectPart = this.toSafeFilename(subjectLabel, 'tat-ca-mon');
        const quizPart = this.toSafeFilename(quizLabel, 'tat-ca-bai-tap');
        link.href = url;
        link.download = subjectPart + '-' + quizPart + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.isPdfExportModalOpen = false;
        toast('Đã xuất ' + questions.length + ' câu hỏi ra file PDF.', 'success');
      } catch (error) {
        toast(error.response?.data?.message || error.message || 'Không thể xuất file PDF.', 'error');
      } finally {
        this.isExportingPdf = false;
        this.loadingMessage = '';
      }
    },
    async handleAddSubject(name) {
      const { toast } = useNotification();
      this.isActionLoading = true;
      this.loadingMessage = 'Đang thêm môn học...';
      try {
        const response = await api.createSubject(name);
        if (response.success) {
          await this.loadSubjects();
          this.activeSubjectId = response.data.id;
          toast(`Đã thêm môn học "${name}" thành công!`, 'success');
        }
      } catch (error) {
        toast(error.response?.data?.message || 'Không thể tạo môn học mới.', 'error');
      } finally {
        this.isActionLoading = false;
        this.loadingMessage = '';
      }
    },
    async handleDeleteSubject(id) {
      const { toast } = useNotification();
      this.isActionLoading = true;
      this.loadingMessage = 'Đang xóa môn học...';
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
      } finally {
        this.isActionLoading = false;
        this.loadingMessage = '';
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
      this.loadingMessage = 'Đang kiểm tra file JSON...';
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
        this.loadingMessage = '';
      }
    },
    async confirmImportJson() {
      const { toast } = useNotification();
      if (!this.jsonImportPreview) {
        toast('Vui lòng preview JSON trước khi import.', 'warning');
        return;
      }

      this.isImportingJson = true;
      this.loadingMessage = 'Đang import câu hỏi...';
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
        this.loadingMessage = '';
      }
    },
    async handleSaveQuestion(questionData) {
      const { toast } = useNotification();
      this.isActionLoading = true;
      this.loadingMessage = questionData.id ? 'Đang cập nhật câu hỏi...' : 'Đang lưu câu hỏi...';
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
          // Reload data
          await Promise.all([
            this.loadQuestionStats(),
            this.loadQuestions()
          ]);
        }
      } catch (error) {
        toast(error.response?.data?.message || 'Không thể lưu câu hỏi.', 'error');
      } finally {
        this.isActionLoading = false;
        this.loadingMessage = '';
      }
    },
    async handleDeleteQuestion(id) {
      const { toast } = useNotification();
      this.isActionLoading = true;
      this.loadingMessage = 'Đang xóa câu hỏi...';
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
      } finally {
        this.isActionLoading = false;
        this.loadingMessage = '';
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


