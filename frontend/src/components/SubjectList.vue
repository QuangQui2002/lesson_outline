<template>
  <div class="subject-section">
    <div class="sidebar-title">Môn Học</div>

    <!-- Form Thêm môn học mới nhanh (Đưa lên đầu) -->
    <div class="sidebar-top-action" style="margin-bottom: 1rem;">
      <form @submit.prevent="submitAddSubject" class="add-subject-form">
        <input 
          v-model="newSubjectName" 
          type="text" 
          placeholder="Tên môn học mới..." 
          class="add-subject-input"
          required
        />
        <button type="submit" class="btn btn-primary" style="padding: 0.5rem 0.85rem; border-radius: var(--radius-sm);">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </form>
    </div>
    
    <div class="subject-nav" style="max-height: 45vh; overflow-y: auto; padding-right: 2px;">
      <!-- Từng môn học cụ thể -->
      <div 
        v-for="subject in sortedSubjects"
        :key="subject.id"
        class="subject-item"
        :class="{ active: activeSubjectId === subject.id }"
        @click="$emit('select-subject', subject.id)"
      >
        <span class="subject-name" :title="subject.name">{{ subject.name }}</span>
        
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="subject-count">{{ questionCounts[subject.id] || 0 }}</span>
          
          <button 
            class="delete-subject-btn"
            title="Xóa môn học này"
            @click.stop="confirmDelete(subject)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useNotification } from '../composables/useNotification.js';

export default {
  name: 'SubjectList',
  props: {
    subjects: {
      type: Array,
      required: true
    },
    activeSubjectId: {
      type: String,
      default: null
    },
    questionCounts: {
      type: Object,
      default: () => ({})
    },
  },
  emits: ['select-subject', 'add-subject', 'delete-subject'],
  data() {
    return {
      newSubjectName: ''
    };
  },
  computed: {
    sortedSubjects() {
      // Helper bóc tách timestamp từ id để sắp xếp chính xác
      const getSubjectTimestamp = (id) => {
        if (!id) return 0;
        const match = id.match(/sub_(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num < 1000) return num; // sub_1, sub_2, sub_3... có timestamp cực nhỏ
          return num; // sub_1779... có timestamp thực tế
        }
        return 0;
      };

      return [...this.subjects].sort((a, b) => getSubjectTimestamp(b.id) - getSubjectTimestamp(a.id));
    }
  },
  methods: {
    submitAddSubject() {
      if (this.newSubjectName.trim() === '') return;
      this.$emit('add-subject', this.newSubjectName.trim());
      this.newSubjectName = '';
    },
    confirmDelete(subject) {
      const { confirm } = useNotification();
      confirm(
        'Xóa Môn Học?',
        `Bạn có chắc chắn muốn xóa môn học "${subject.name}" không? Tất cả các câu hỏi thuộc môn học này cũng sẽ bị xóa vĩnh viễn khỏi ngân hàng đề.`,
        () => {
          this.$emit('delete-subject', subject.id);
        }
      );
    }
  }
};
</script>
