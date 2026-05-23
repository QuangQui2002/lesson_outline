<template>
  <DefaultLayout 
    @open-ocr="openOcrModal"
    @open-add="openAddQuestionModal"
  >
    <!-- Slot danh sách môn học cho Sidebar -->
    <template #sidebar>
      <SubjectList
        :subjects="subjects"
        :active-subject-id="activeSubjectId"
        :question-counts="questionCounts"
        :total-questions-count="questions.length"
        @select-subject="selectSubject"
        @add-subject="handleAddSubject"
        @delete-subject="handleDeleteSubject"
      />
    </template>

    <!-- Nội dung chính: Thống kê & Ô tìm kiếm & Danh sách câu hỏi -->
    <div>
      


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
      questions: [], // Tất cả câu hỏi để tính toán thống kê
      filteredQuestions: [], // Danh sách câu hỏi hiển thị sau lọc/search
      activeSubjectId: null,
      searchQuery: '',
      isLoading: false,
      isQuestionModalOpen: false,
      isOcrModalOpen: false,
      editingQuestion: null
    };
  },
  computed: {
    totalQuestions() {
      return this.questions.length;
    },
    ocrQuestionsCount() {
      return this.questions.filter(q => q.tags && q.tags.includes('ocr')).length;
    },
    // Tính toán số lượng câu hỏi trên mỗi môn học
    questionCounts() {
      const counts = {};
      this.questions.forEach(q => {
        counts[q.subjectId] = (counts[q.subjectId] || 0) + 1;
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
        await Promise.all([
          this.loadSubjects(),
          this.loadAllQuestionsCount(),
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
    // Lấy toàn bộ câu hỏi (không lọc) để tính thống kê và số lượng
    async loadAllQuestionsCount() {
      const response = await api.getQuestions();
      if (response.success) {
        this.questions = response.data;
      }
    },
    // Lấy câu hỏi hiển thị có lọc theo môn học & tìm kiếm
    async loadQuestions() {
      try {
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
    async handleAddSubject(name) {
      const { toast } = useNotification();
      try {
        const response = await api.createSubject(name);
        if (response.success) {
          await this.loadSubjects();
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
            this.activeSubjectId = null;
          }
          await Promise.all([
            this.loadSubjects(),
            this.loadAllQuestionsCount(),
            this.loadQuestions()
          ]);
          toast('Đã xóa môn học thành công!', 'success');
        }
      } catch (error) {
        toast('Có lỗi xảy ra khi xóa môn học.', 'error');
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
            this.loadAllQuestionsCount(),
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
            this.loadAllQuestionsCount(),
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
        this.loadAllQuestionsCount(),
        this.loadQuestions()
      ]);
    }
  }
};
</script>
