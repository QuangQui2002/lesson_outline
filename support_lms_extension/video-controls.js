(function () {
  const PANEL_ID = 'lms-video-enhancer-panel';
  const STYLE_ID = 'lms-video-enhancer-style';
  const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
  let activeVideo = null;
  let currentRate = 1;
  let keepPlaying = false;
  let pipAutoResumeUntil = 0;

  function findVideos() {
    return Array.from(document.querySelectorAll('video'))
      .filter(video => video instanceof HTMLVideoElement);
  }

  function getBestVideo() {
    const videos = findVideos();
    if (activeVideo && videos.includes(activeVideo)) return activeVideo;
    return videos.find(video => !video.paused) || videos.find(video => video.duration || video.currentSrc || video.src) || videos[0] || null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.88);
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28);
        backdrop-filter: blur(10px);
        font-family: Arial, sans-serif;
      }
      #${PANEL_ID}[hidden] { display: none !important; }
      #${PANEL_ID} button {
        border: 0;
        border-radius: 999px;
        padding: 7px 10px;
        color: #e5edff;
        background: rgba(255, 255, 255, 0.12);
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
      }
      #${PANEL_ID} button:hover { background: rgba(96, 165, 250, 0.34); }
      #${PANEL_ID} button.active { color: #0f172a; background: #93c5fd; }
      #${PANEL_ID} .pip { background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; }
      #${PANEL_ID} .sound { background: rgba(16, 185, 129, 0.72); color: white; }
      #${PANEL_ID} .action { background: linear-gradient(135deg, #4f46e5, #2563eb); color: white; }
      #${PANEL_ID} .action.question { background: linear-gradient(135deg, #0f766e, #14b8a6); }
      #${PANEL_ID} .action.answer { background: linear-gradient(135deg, #7c3aed, #db2777); }
    `;
    document.documentElement.appendChild(style);
  }

  function getToolbarActionHtml() {
    const pathname = location.pathname;
    if (/^\/course\/\d+\/?$/.test(pathname) || /^\/course\/\d+\/video\/\d+\/?$/.test(pathname)) {
      return '<button type="button" class="action save-video" title="Lưu danh sách bài học video">Lưu video</button>';
    }
    if (/\/attempt\/\d+\/review\/?$/.test(pathname)) {
      return '<button type="button" class="action question import-questions" title="Import câu hỏi review">Lấy câu hỏi</button>';
    }
    if (/\/attempt\/\d+\/?$/.test(pathname)) {
      return '<button type="button" class="action answer solve-attempt" title="Nhờ AI trả lời attempt">AI đáp án</button>';
    }
    return '';
  }

  function sendToolbarAction(type) {
    window.postMessage({ source: 'lms-tvu-helper-toolbar', type }, '*');
  }

  function applyRate(rate) {
    currentRate = rate;
    findVideos().forEach(video => {
      try { video.playbackRate = rate; } catch (error) {}
    });
    updateActiveButtons();
  }

  function ensureAudioOn(video) {
    if (!video) return;
    try { video.muted = false; } catch (error) {}
    try { video.defaultMuted = false; } catch (error) {}
    try { video.removeAttribute('muted'); } catch (error) {}
    try {
      if (!Number.isFinite(video.volume) || video.volume < 0.1) video.volume = 1;
    } catch (error) {}
  }

  function safePlay(video) {
    if (!video || video.ended) return;
    ensureAudioOn(video);
    try {
      const promise = video.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    } catch (error) {}
  }

  function keepActiveVideoPlaying() {
    const video = getBestVideo();
    if (!video) return;
    activeVideo = video;
    ensureAudioOn(video);
    try { video.playbackRate = currentRate; } catch (error) {}
    if (keepPlaying && video.paused && !video.ended) {
      safePlay(video);
    }
  }

  function updateActiveButtons() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll('[data-rate]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.rate) === currentRate);
    });
  }

  async function togglePictureInPicture() {
    const video = getBestVideo();
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        keepPlaying = false;
        await document.exitPictureInPicture();
      } else if (!video.disablePictureInPicture) {
        keepPlaying = true;
        pipAutoResumeUntil = Date.now() + 2500;
        ensureAudioOn(video);
        safePlay(video);
        await video.requestPictureInPicture();
      }
    } catch (error) {}
  }

  function ensurePanel() {
    ensureStyle();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      const actionHtml = getToolbarActionHtml();
      panel.innerHTML = RATES.map(rate => `<button type="button" data-rate="${rate}">${rate}x</button>`).join('')
        + '<button type="button" class="sound">Âm</button><button type="button" class="pip">PiP</button>'
        + actionHtml;
      panel.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.rate) applyRate(Number(button.dataset.rate));
        if (button.classList.contains('sound')) {
          const video = getBestVideo();
          ensureAudioOn(video);
          safePlay(video);
        }
        if (button.classList.contains('pip')) togglePictureInPicture();
        if (button.classList.contains('save-video')) sendToolbarAction('SAVE_VIDEO');
        if (button.classList.contains('import-questions')) sendToolbarAction('IMPORT_QUESTIONS');
        if (button.classList.contains('solve-attempt')) sendToolbarAction('SOLVE_ATTEMPT');
      });
      document.documentElement.appendChild(panel);
      window.postMessage({ source: 'lms-tvu-helper-toolbar', type: 'TOOLBAR_READY', hasAction: actionHtml !== '' }, '*');
    }
    panel.hidden = findVideos().length === 0;
    updateActiveButtons();
  }

  function watchVideos() {
    findVideos().forEach(video => {
      if (video.dataset.lmsVideoEnhancerReady) return;
      video.dataset.lmsVideoEnhancerReady = '1';
      ensureAudioOn(video);
      video.playbackRate = currentRate;
      video.addEventListener('play', () => {
        activeVideo = video;
        keepPlaying = document.pictureInPictureElement === video && Date.now() <= pipAutoResumeUntil;
        ensureAudioOn(video);
        video.playbackRate = currentRate;
        updateActiveButtons();
      });
      video.addEventListener('volumechange', () => {
        if (keepPlaying || document.pictureInPictureElement === video) ensureAudioOn(video);
      });
      video.addEventListener('pause', () => {
        if (document.pictureInPictureElement !== video || Date.now() > pipAutoResumeUntil) {
          keepPlaying = false;
        }
        if (document.pictureInPictureElement === video && keepPlaying) {
          setTimeout(() => keepActiveVideoPlaying(), 150);
        }
      });
      video.addEventListener('loadedmetadata', () => {
        video.playbackRate = currentRate;
        ensurePanel();
      });
    });
    ensurePanel();
  }

  const observer = new MutationObserver(watchVideos);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  watchVideos();
  window.addEventListener('load', watchVideos);
  document.addEventListener('visibilitychange', () => setTimeout(keepActiveVideoPlaying, 150), true);
  window.addEventListener('blur', () => setTimeout(keepActiveVideoPlaying, 150), true);
  document.addEventListener('leavepictureinpicture', () => { keepPlaying = false; }, true);
  document.addEventListener('enterpictureinpicture', () => {
    keepPlaying = true;
    pipAutoResumeUntil = Date.now() + 2500;
  }, true);
  setInterval(watchVideos, 2000);
  setInterval(keepActiveVideoPlaying, 1200);
})();


