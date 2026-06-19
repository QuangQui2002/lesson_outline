<template>
  <section class="lesson-video-panel">
    <div class="lesson-video-header">
      <div>
        <span class="lesson-video-kicker">Bài học video</span>
        <h2>Danh sách bài học trong môn</h2>
        <p>Video được lấy từ LMS TVU bằng extension và lưu theo môn học đang chọn.</p>
      </div>
      <button class="btn btn-secondary" type="button" @click="$emit('refresh')">Tải lại</button>
    </div>

    <HamsterLoading v-if="isLoading" message="Đang tải bài học video..." inline />

    <div v-else-if="lessons.length === 0" class="empty-state lesson-video-empty">
      <p>Chưa có bài học video cho môn này.</p>
      <small>Mở trang môn học trên LMS TVU, bấm extension &ldquo;Lưu bài học video&rdquo;, sau đó quay lại bấm &ldquo;Tải lại&rdquo;.</small>
    </div>

    <div v-else class="lesson-video-layout">
      <aside class="lesson-video-sidebar">
        <div v-for="group in groupedLessons" :key="group.weekName" class="lesson-video-week">
          <button
            type="button"
            class="lesson-video-week__toggle"
            :class="{ active: isWeekExpanded(group.weekName) }"
            @click="toggleWeek(group.weekName)"
          >
            <span>{{ group.weekName || 'Chưa rõ tuần' }}</span>
            <small>{{ group.lessons.length }} bài</small>
            <span class="lesson-video-week__chevron" aria-hidden="true">v</span>
          </button>

          <div v-show="isWeekExpanded(group.weekName)" class="lesson-video-week__body">
            <button
              v-for="lesson in group.lessons"
              :key="lesson.id || lesson.moduleId"
              type="button"
              class="lesson-video-item"
              :class="{ active: selectedLessonKey === getLessonKey(lesson) }"
              @click="selectLesson(lesson)"
            >
              <span>{{ lesson.lessonName }}</span>
              <small>ID: {{ lesson.moduleId || lesson.cmid || 'N/A' }}</small>
            </button>
          </div>
        </div>
      </aside>

      <article class="lesson-video-player">
        <div v-if="selectedLesson" class="lesson-video-player__header">
          <div>
            <p>{{ selectedLesson.weekName || 'Chưa rõ tuần' }}</p>
            <h3>{{ selectedLesson.lessonName }}</h3>
          </div>
          <div class="lesson-video-player__actions">
            <a v-if="selectedLmsUrl" class="btn btn-secondary btn-sm" :href="selectedLmsUrl" target="_blank" rel="noopener noreferrer">M? tr?n LMS</a>
          </div>
        </div>

        <div v-if="selectedVideoUrl" class="lesson-video-frame-wrap">
          <iframe
            :key="selectedVideoUrl"
            class="lesson-video-frame"
            :src="selectedVideoUrl"
            :title="selectedLesson?.lessonName || 'Video b?i h?c'"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          ></iframe>
        </div>
        <p v-if="selectedVideoUrl" class="lesson-video-player-note">
          Nếu đã cài extension, nút chỉnh tốc độ và Picture-in-Picture sẽ xuất hiện trực tiếp trong khung video khi LMS tải được thẻ video.
        </p>

        <div v-else class="empty-state lesson-video-empty">
          <p>Bài học này chưa có link video.</p>
        </div>
      </article>
    </div>
  </section>
</template>

<script>
import HamsterLoading from './HamsterLoading.vue';

export default {
  name: 'LessonVideoList',
  components: { HamsterLoading },
  props: {
    lessons: {
      type: Array,
      default: () => []
    },
    isLoading: {
      type: Boolean,
      default: false
    }
  },
  emits: ['refresh'],
  data() {
    return {
      selectedLessonKey: '',
      expandedWeekKey: '',
      playbackRate: 1
    };
  },
  computed: {
    groupedLessons() {
      const groups = new Map();
      this.sortedLessons.forEach(lesson => {
        const key = lesson.weekName || 'Chưa rõ tuần';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(lesson);
      });

      return Array.from(groups.entries()).map(([weekName, lessons]) => ({ weekName, lessons }));
    },
    sortedLessons() {
      return [...this.lessons].sort((a, b) => {
        const weekCompare = String(a.weekName || '').localeCompare(String(b.weekName || ''), 'vi', { numeric: true });
        if (weekCompare !== 0) return weekCompare;
        return (Number(a.moduleId) || 0) - (Number(b.moduleId) || 0);
      });
    },
    selectedLesson() {
      return this.sortedLessons.find(lesson => this.getLessonKey(lesson) === this.selectedLessonKey) || this.sortedLessons[0] || null;
    },
    selectedVideoUrl() {
      return this.selectedLesson?.videoUrl || this.selectedLesson?.externalUrls?.[0] || '';
    },
    selectedLmsUrl() {
      return this.selectedLesson?.pageUrl || '';
    }
  },
  watch: {
    lessons: {
      immediate: true,
      handler() {
        if (!this.selectedLessonKey && this.sortedLessons.length > 0) {
          this.selectedLessonKey = this.getLessonKey(this.sortedLessons[0]);
        }
        if (this.selectedLessonKey && !this.sortedLessons.some(lesson => this.getLessonKey(lesson) === this.selectedLessonKey)) {
          this.selectedLessonKey = this.sortedLessons[0] ? this.getLessonKey(this.sortedLessons[0]) : '';
        }

        if (!this.expandedWeekKey && this.groupedLessons.length > 0) {
          this.expandedWeekKey = this.groupedLessons[0].weekName;
        }
        if (this.expandedWeekKey && !this.groupedLessons.some(group => group.weekName === this.expandedWeekKey)) {
          this.expandedWeekKey = this.groupedLessons[0]?.weekName || '';
        }
      }
    }
  },
  methods: {
    getLessonKey(lesson) {
      return String(lesson.id || lesson.moduleId || lesson.pageUrl || lesson.lessonName);
    },
    selectLesson(lesson) {
      this.selectedLessonKey = this.getLessonKey(lesson);
      this.expandedWeekKey = lesson.weekName || 'Ch?a r? tu?n';
    },
    isWeekExpanded(weekName) {
      return this.expandedWeekKey === (weekName || 'Ch?a r? tu?n');
    },
    toggleWeek(weekName) {
      const key = weekName || 'Ch?a r? tu?n';
      this.expandedWeekKey = this.expandedWeekKey === key ? '' : key;
    }
  }
};
</script>

