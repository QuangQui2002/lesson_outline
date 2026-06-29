<template>
  <div>
    <div class="questions-header">
      <h2>Danh sách Câu Hỏi ({{ questions.length }})</h2>
    </div>

    <!-- Trạng thái trống (Không có câu hỏi nào) -->
    <div v-if="questions.length === 0" class="empty-state">
      <div class="empty-icon">📂</div>
      <h3>Không tìm thấy câu hỏi nào</h3>
      <p>Nhấp vào nút "Thêm Câu Hỏi" hoặc "Quét Ảnh OCR" để tạo câu hỏi mới.</p>
    </div>

    <!-- Danh sách câu hỏi dạng grid -->
    <div v-else class="questions-grid">
      <div 
        v-for="question in questions" 
        :key="question.id" 
        class="question-card"
      >
        <div class="question-card-header">
          <!-- Huy hiệu tên môn học -->
          <span class="subject-badge">
            {{ getSubjectName(question.subjectId) }}
          </span>

          <span class="quiz-badge">
            {{ question.quizName || 'Khác' }}
          </span>

          <!-- Các nút thao tác sửa / xóa -->
          <div class="question-actions">
            <button 
              class="action-icon-btn" 
              title="Chỉnh sửa câu hỏi"
              @click="$emit('edit-question', question)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button 
              class="action-icon-btn delete" 
              title="Xóa câu hỏi"
              @click="confirmDelete(question)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>

        <!-- Nội dung câu hỏi -->
        <div class="question-content" v-html="sanitizeQuestionContent(question.content)"></div>

        <!-- Đáp án câu hỏi -->
        <div class="question-answer-box">
          <strong style="display: block; margin-bottom: 0.25rem; color: var(--primary); font-size: 0.8rem; text-transform: uppercase;">Đáp án:</strong>
          <div class="question-answer-content" v-html="sanitizeQuestionContent(question.answer)"></div>
        </div>

        <!-- Từ khóa & Tags -->
        <div v-if="question.tags && question.tags.length > 0" class="question-tags">
          <span 
            v-for="(tag, idx) in question.tags" 
            :key="idx" 
            class="tag-pill"
          >
            #{{ tag }}
          </span>
        </div>

        <!-- Ngày tạo -->
        <div class="question-date">
          Cập nhật: {{ formatDate(question.createdAt) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useNotification } from '../composables/useNotification.js';

export default {
  name: 'QuestionList',
  props: {
    questions: {
      type: Array,
      required: true
    },
    subjects: {
      type: Array,
      required: true
    }
  },
  emits: ['edit-question', 'delete-question'],
  methods: {
    getSubjectName(subjectId) {
      const subject = this.subjects.find(s => s.id === subjectId);
      return subject ? subject.name : 'Môn học khác';
    },
    sanitizeQuestionContent(content = '') {
      if (typeof window === 'undefined') return String(content || '');
      const template = document.createElement('template');
      template.innerHTML = String(content || '');
      const allowedTags = new Set(['BR', 'IMG', 'A', 'U', 'B', 'STRONG', 'I', 'EM', 'P', 'DIV', 'SPAN', 'CODE', 'PRE', 'SUP', 'SUB']);
      template.content.querySelectorAll('*').forEach(element => {
        if (!allowedTags.has(element.tagName)) {
          element.replaceWith(document.createTextNode(element.textContent || ''));
          return;
        }
        [...element.attributes].forEach(attribute => {
          const name = attribute.name.toLowerCase();
          const attrValue = attribute.value || '';
          if (element.tagName === 'IMG' && name === 'src' && /^(data:image\/|https:\/\/)/i.test(attrValue)) return;
          if (element.tagName === 'A' && name === 'href' && /^https:\/\//i.test(attrValue)) return;
          if (element.tagName === 'A' && ['target', 'rel'].includes(name)) return;
          if (element.tagName === 'SPAN' && name === 'class' && /^(automslc-omml|math|math-inline|katex|katex-html|katex-mathml)$/i.test(attrValue)) return;
          element.removeAttribute(attribute.name);
        });
        if (element.tagName === 'A') {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        }
      });
      const imageUrlPattern = /https:\/\/[^\s<>'"]+?\.(?:png|jpe?g|gif|webp)(?:\?[^\s<>'"]*)?/gi;
      const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(node => {
        if (node.parentElement?.closest('a')) return;
        const value = node.nodeValue || '';
        if (!imageUrlPattern.test(value)) return;
        imageUrlPattern.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        value.replace(imageUrlPattern, (url, index) => {
          if (index > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)));
          const image = document.createElement('img');
          image.src = url;
          image.alt = 'H?nh minh h?a c?u h?i';
          image.loading = 'lazy';
          fragment.appendChild(image);
          lastIndex = index + url.length;
          return url;
        });
        if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
        node.replaceWith(fragment);
      });
      return template.innerHTML;
    },
    formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    },
    confirmDelete(question) {
      const { confirm } = useNotification();
      confirm(
        'Xóa Câu Hỏi?',
        'Bạn có chắc chắn muốn xóa câu hỏi này khỏi đề cương ôn tập không? Hành động này không thể hoàn tác.',
        () => {
          this.$emit('delete-question', question.id);
        }
      );
    }
  }
};
</script>
