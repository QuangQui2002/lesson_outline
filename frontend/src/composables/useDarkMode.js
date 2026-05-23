import { ref, onMounted } from 'vue';

export function useDarkMode() {
  const isDark = ref(false);

  const toggleDarkMode = () => {
    isDark.value = !isDark.value;
    const theme = isDark.value ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  };

  const initTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      isDark.value = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      isDark.value = false;
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  return {
    isDark,
    toggleDarkMode,
    initTheme
  };
}
