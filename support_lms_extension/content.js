function getAttemptIdFromUrl() {
  const match = location.pathname.match(/\/attempt\/(\d+)\/review/);
  return match ? match[1] : '';
}

function getLiveAttemptIdFromUrl() {
  const match = location.pathname.match(/\/attempt\/(\d+)(?:\/)?$/);
  return match ? match[1] : '';
}

function isAttemptReviewPage() {
  return Boolean(getAttemptIdFromUrl());
}

function isLiveAttemptPage() {
  return Boolean(getLiveAttemptIdFromUrl());
}

let reviewImportPromise = null;
let autoImportedAttemptId = '';
let importNotificationTimer = null;

function setStatus(text, type = 'info') {
  const status = document.querySelector('#lms-helper-status');
  if (!status) return;
  status.textContent = text;
  status.dataset.type = type;
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c ' + url + ' (' + response.status + ')');
  return response.json();
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSimpleLatex(value = '') {
  return String(value || '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\times/g, '\u00d7')
    .replace(/\\cdot/g, '\u00b7')
    .replace(/\\leq?/g, '\u2264')
    .replace(/\\geq?/g, '\u2265')
    .replace(/\\neq/g, '\u2260')
    .replace(/\\infty/g, '\u221e')
    .replace(/\\pm/g, '\u00b1')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .trim();
}

function getMatrixDelimiters(expression = '', environment = '') {
  const delimiters = [];
  if (/\\left\s*\[/.test(expression)) delimiters.push(['[', ']']);
  else if (/\\left\s*\\\{/.test(expression)) delimiters.push(['{', '}']);
  else if (/\\left\s*\|/.test(expression)) delimiters.push(['|', '|']);

  const environmentDelimiters = {
    pmatrix: ['(', ')'],
    bmatrix: ['[', ']'],
    Bmatrix: ['{', '}'],
    vmatrix: ['|', '|'],
    Vmatrix: ['\u2016', '\u2016']
  };
  if (environmentDelimiters[environment]) delimiters.push(environmentDelimiters[environment]);
  return delimiters;
}

function createMatrixElement(expression = '', isBlock = false) {
  const matrixMatch = String(expression).match(/\\begin\{(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{\1\}/);
  if (!matrixMatch) return null;

  const rows = matrixMatch[2]
    .split(/\\\\/)
    .map(row => row.split('&').map(cell => formatSimpleLatex(cell)))
    .filter(row => row.some(Boolean));
  if (rows.length === 0) return null;

  const math = document.createElement('span');
  math.className = isBlock ? 'lms-math lms-math--block' : 'lms-math';
  const matrix = document.createElement('span');
  matrix.className = 'lms-math-matrix';
  const delimiters = getMatrixDelimiters(expression, matrixMatch[1]);

  delimiters.forEach(([open]) => {
    const delimiter = document.createElement('span');
    delimiter.className = 'lms-math-delimiter';
    delimiter.textContent = open;
    matrix.appendChild(delimiter);
  });

  const table = document.createElement('table');
  table.setAttribute('role', 'presentation');
  rows.forEach(row => {
    const tableRow = document.createElement('tr');
    row.forEach(cell => {
      const tableCell = document.createElement('td');
      tableCell.textContent = cell;
      tableRow.appendChild(tableCell);
    });
    table.appendChild(tableRow);
  });
  matrix.appendChild(table);

  [...delimiters].reverse().forEach(([, close]) => {
    const delimiter = document.createElement('span');
    delimiter.className = 'lms-math-delimiter';
    delimiter.textContent = close;
    matrix.appendChild(delimiter);
  });
  math.appendChild(matrix);
  return math;
}

function renderLatexTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach(node => {
    if (node.parentElement?.closest('code, pre, .lms-math')) return;
    const value = node.nodeValue || '';
    const latexPattern = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
    if (!latexPattern.test(value)) return;
    latexPattern.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    value.replace(latexPattern, (match, inlineExpression, displayExpression, offset) => {
      if (offset > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, offset)));
      const expression = String(inlineExpression ?? displayExpression ?? '').trim();
      const isBlock = displayExpression !== undefined;
      let math = null;
      if (globalThis.katex?.renderToString) {
        math = document.createElement('span');
        math.className = isBlock ? 'lms-math lms-math--block' : 'lms-math';
        math.innerHTML = globalThis.katex.renderToString(expression, {
          displayMode: isBlock,
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          output: 'htmlAndMathml'
        });
      } else {
        math = createMatrixElement(expression, isBlock);
      }
      if (math) fragment.appendChild(math);
      else {
        const fallback = document.createElement('span');
        fallback.className = isBlock ? 'lms-math lms-math--block' : 'lms-math';
        fallback.textContent = formatSimpleLatex(expression);
        fragment.appendChild(fallback);
      }
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    node.replaceWith(fragment);
  });
}

function sanitizeQuestionHtml(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const template = document.createElement('template');
  template.innerHTML = raw;
  const allowedTags = new Set([
    'BR', 'IMG', 'A', 'AUDIO', 'SOURCE', 'U', 'B', 'STRONG', 'I', 'EM', 'P', 'DIV', 'SPAN', 'CODE', 'PRE', 'SUP', 'SUB',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'MARK', 'S', 'DEL'
  ]);
  template.content.querySelectorAll('*').forEach(element => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      return;
    }
    [...element.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const attrValue = attribute.value || '';
      if (element.tagName === 'IMG' && name === 'src' && /^(data:image\/|https:\/\/)/i.test(attrValue)) return;
      if (element.tagName === 'AUDIO' && name === 'src' && /^https:\/\//i.test(attrValue)) return;
      if (element.tagName === 'AUDIO' && name === 'controls') return;
      if (element.tagName === 'AUDIO' && name === 'preload' && /^(none|metadata)$/i.test(attrValue)) return;
      if (element.tagName === 'SOURCE' && name === 'src' && /^https:\/\//i.test(attrValue)) return;
      if (element.tagName === 'SOURCE' && name === 'type' && /^audio\//i.test(attrValue)) return;
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
  const audioUrlPattern = /https:\/\/[^\s<>'"]+?\.(?:mp3|m4a|aac|ogg|oga|wav|webm)(?:\?[^\s<>'"]*)?/gi;
  template.content.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (audioUrlPattern.test(href)) {
      audioUrlPattern.lastIndex = 0;
      const audio = document.createElement('audio');
      audio.src = href;
      audio.controls = true;
      audio.preload = 'metadata';
      link.replaceWith(audio);
      return;
    }
    audioUrlPattern.lastIndex = 0;
    if (!imageUrlPattern.test(href)) return;
    imageUrlPattern.lastIndex = 0;
    const wrapper = document.createElement('div');
    wrapper.className = 'question-inline-image-group';
    const image = document.createElement('img');
    image.src = href;
    image.alt = 'H\u00ecnh minh h\u1ecda c\u00e2u h\u1ecfi';
    image.loading = 'lazy';
    wrapper.appendChild(image);
    wrapper.appendChild(link.cloneNode(true));
    link.replaceWith(wrapper);
  });
  const audioWalker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const audioTextNodes = [];
  while (audioWalker.nextNode()) audioTextNodes.push(audioWalker.currentNode);
  audioTextNodes.forEach(node => {
    if (node.parentElement?.closest('audio, a')) return;
    const value = node.nodeValue || '';
    if (!audioUrlPattern.test(value)) return;
    audioUrlPattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    value.replace(audioUrlPattern, (url, index) => {
      if (index > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)));
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      audio.preload = 'metadata';
      fragment.appendChild(audio);
      lastIndex = index + url.length;
      return url;
    });
    if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    node.replaceWith(fragment);
  });
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(node => {
    const value = node.nodeValue || '';
    if (!imageUrlPattern.test(value)) return;
    imageUrlPattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let matched = false;
    value.replace(imageUrlPattern, (url, index) => {
      matched = true;
      if (index > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)));
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'H\u00ecnh minh h\u1ecda c\u00e2u h\u1ecfi';
      image.loading = 'lazy';
      fragment.appendChild(image);
      lastIndex = index + url.length;
      return url;
    });
    if (!matched) return;
    if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    node.replaceWith(fragment);
  });
  renderLatexTextNodes(template.content);
  return template.innerHTML;
}

function getSkippedQuestionNumber(item = {}) {
  return item.slot || Number(item.index) + 1 || '?';
}

function showImportNotification(result = {}, questionCount = 0) {
  document.querySelector('#lms-import-notification')?.remove();
  if (importNotificationTimer) clearTimeout(importNotificationTimer);

  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  const duplicates = skipped.filter(item => item.type === 'duplicate');
  const otherSkipped = skipped.filter(item => item.type !== 'duplicate');
  const importedCount = Number(result.importedCount) || 0;
  const imageWarningCount = result.imageWarnings?.length || 0;
  const audioWarningCount = result.audioWarnings?.length || 0;
  const type = imageWarningCount > 0 || audioWarningCount > 0
    ? 'warning'
    : importedCount > 0
      ? 'success'
      : duplicates.length > 0
        ? 'warning'
        : 'error';
  const duplicateItems = duplicates.slice(0, 15).map(item => {
    const similarity = item.similarity ? ' - giống ' + Math.round(item.similarity * 100) + '%' : '';
    return '<li>Câu ' + escapeHtml(getSkippedQuestionNumber(item)) + escapeHtml(similarity) + '</li>';
  }).join('');
  const remainingDuplicates = duplicates.length > 15
    ? '<li>Và ' + (duplicates.length - 15) + ' câu trùng khác.</li>'
    : '';
  const otherSkippedText = otherSkipped.length > 0
    ? '<p>Bỏ qua khác: ' + otherSkipped.map(item => 'câu ' + escapeHtml(getSkippedQuestionNumber(item))).join(', ') + '.</p>'
    : '';

  const notification = document.createElement('section');
  notification.id = 'lms-import-notification';
  notification.dataset.type = type;
  notification.innerHTML = '<div class="lms-import-notification__header"><strong>Kết quả import câu hỏi</strong><button type="button" aria-label="Đóng">&times;</button></div>'
    + '<div class="lms-import-notification__body">'
    + '<p>Đã import <strong>' + importedCount + '/' + questionCount + '</strong> câu hỏi.</p>'
    + (duplicates.length > 0
      ? '<p>Phát hiện <strong>' + duplicates.length + '</strong> câu trùng:</p><ul>' + duplicateItems + remainingDuplicates + '</ul>'
      : '<p>Không phát hiện câu hỏi trùng.</p>')
    + otherSkippedText
    + (imageWarningCount > 0 ? '<p>Có ' + imageWarningCount + ' ảnh chưa lưu được.</p>' : '')
    + (audioWarningCount > 0 ? '<p>Có ' + audioWarningCount + ' file âm thanh chưa lưu được; hệ thống vẫn giữ link LMS.</p>' : '')
    + '</div>';
  document.body.appendChild(notification);

  const closeNotification = () => {
    notification.remove();
    if (importNotificationTimer) clearTimeout(importNotificationTimer);
    importNotificationTimer = null;
  };
  notification.querySelector('button').addEventListener('click', closeNotification);
  importNotificationTimer = setTimeout(closeNotification, 30000);
}

function showImportErrorNotification(message) {
  showImportNotification({ importedCount: 0, skipped: [], imageWarnings: [] }, 0);
  const notification = document.querySelector('#lms-import-notification');
  if (!notification) return;
  notification.dataset.type = 'error';
  notification.querySelector('.lms-import-notification__body').innerHTML = '<p>Lỗi: ' + escapeHtml(message) + '</p>';
}

function renderAiAnswerPanel(answers = [], meta = {}) {
  let panel = document.querySelector('#lms-ai-answer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lms-ai-answer-panel';
    document.body.appendChild(panel);
  }

  const answerItems = answers.length > 0
    ? answers.map(answer => {
      const questionHtml = sanitizeQuestionHtml(answer.questionHtml || answer.questionText || '');
      const isDatabaseAnswer = answer.source === 'database';
      const isUnavailable = answer.source === 'unavailable';
      if (isUnavailable) {
        return `
        <div class="lms-ai-answer-item lms-ai-answer-item--unavailable">
          <strong>C\u00e2u ${escapeHtml(answer.slot)} <em>Chưa có thông tin</em></strong>
          ${questionHtml ? `<div class="lms-ai-question-text">${questionHtml}</div>` : ''}
          <div class="lms-ai-answer-warning">Chưa tìm thấy câu hỏi có cùng nội dung và URL âm thanh trong Lesson Outline.</div>
        </div>`;
      }
      if (!isDatabaseAnswer) {
        return `
        <div class="lms-ai-answer-item">
          <strong>C\u00e2u ${escapeHtml(answer.slot)}: ${escapeHtml(answer.answerLabel || '')} <em>AI</em></strong>
          ${questionHtml ? `<div class="lms-ai-question-text">${questionHtml}</div>` : ''}
          <p>${escapeHtml(answer.answerText || 'Kh\u00f4ng c\u00f3 n\u1ed9i dung \u0111\u00e1p \u00e1n.')}</p>
          ${answer.explanation ? `<small>${escapeHtml(answer.explanation)}</small>` : ''}
        </div>`;
      }

      const answerValue = answer.fullAnswerText || answer.answerText || answer.answerLabel || 'Kh\u00f4ng c\u00f3 n\u1ed9i dung \u0111\u00e1p \u00e1n.';
      const answerHtml = answer.fullAnswerHtml
        ? sanitizeQuestionHtml(answer.fullAnswerHtml)
        : sanitizeQuestionHtml(escapeHtml(answerValue));
      return `
      <div class="lms-ai-answer-item">
        <strong>C\u00e2u ${escapeHtml(answer.slot)} <em>H\u1ec7 th\u1ed1ng</em></strong>
        ${questionHtml ? `<div class="lms-ai-question-text">${questionHtml}</div>` : ''}
        <div class="lms-ai-answer-result">
          <span>\u0110\u00e1p \u00e1n \u0111\u00fang</span>
          <div class="lms-ai-answer-content">${answerHtml}</div>
        </div>
        ${answer.explanation ? `<div class="lms-ai-answer-hint"><span>G\u1ee3i \u00fd \u0111\u00e1p \u00e1n</span><small>${escapeHtml(answer.explanation)}</small></div>` : ''}
      </div>`;
    }).join('')
    : '<p class="lms-ai-answer-empty">Ch\u01b0a c\u00f3 \u0111\u00e1p \u00e1n.</p>';
  panel.innerHTML = `
    <div class="lms-ai-answer-header">
      <span>Đáp án câu hỏi</span>
      <button id="lms-ai-answer-close" type="button" title="Đóng">×</button>
    </div>
    <div class="lms-ai-answer-summary">${meta.databaseCount || 0} câu từ hệ thống • ${meta.aiCount || 0} câu dùng AI</div>
    ${meta.aiError ? `<div class="lms-ai-answer-warning">${escapeHtml(meta.aiError)}</div>` : ''}
    <div class="lms-ai-answer-body">${answerItems}</div>
  `;
  panel.querySelector('#lms-ai-answer-close').addEventListener('click', () => panel.remove());
}

function renderAiStatusPanel(message = 'Đang xử lý...', type = 'loading') {
  let panel = document.querySelector('#lms-ai-answer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lms-ai-answer-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="lms-ai-answer-header">
      <span>Đáp án AI</span>
      <button id="lms-ai-answer-close" type="button" title="Đóng">×</button>
    </div>
    <div class="lms-ai-answer-body">
      <p class="lms-ai-answer-empty lms-ai-answer-${type}">${escapeHtml(message)}</p>
    </div>
  `;
  panel.querySelector('#lms-ai-answer-close').addEventListener('click', () => panel.remove());
}
async function collectLiveAttemptQuestions() {
  const attemptId = getLiveAttemptIdFromUrl();
  if (!attemptId) throw new Error('Không tìm thấy mã attempt trên URL.');

  setStatus('Đang tải câu hỏi attempt trang 1...', 'loading');
  const firstPage = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '?page=1');
  const payload = firstPage?.data || firstPage || {};
  const totalPage = Number(payload.totalpage || firstPage.totalpage || 1) || 1;
  const questions = [...(payload.questions || firstPage.questions || [])];

  for (let page = 2; page <= totalPage; page += 1) {
    setStatus('Đang tải câu hỏi attempt trang ' + page + '/' + totalPage + '...', 'loading');
    const pageJson = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '?page=' + page);
    const pagePayload = pageJson?.data || pageJson || {};
    questions.push(...(pagePayload.questions || pageJson.questions || []));
  }

  return { ...payload, questions, totalquestions: questions.length };
}

async function solveLiveAttemptQuestions() {
  renderAiStatusPanel('Đang tải câu hỏi từ LMS...', 'loading');
  try {
    const attemptJson = await collectLiveAttemptQuestions();
    renderAiStatusPanel('Đang nhờ AI trả lời ' + (attemptJson.questions?.length || 0) + ' câu hỏi...', 'loading');
    setStatus('Đang nhờ AI trả lời ' + (attemptJson.questions?.length || 0) + ' câu hỏi...', 'loading');
    const response = await chrome.runtime.sendMessage({ type: 'SOLVE_ATTEMPT_QUESTIONS', attemptJson });
    if (!response?.ok) throw new Error(response?.message || 'Không lấy được đáp án AI.');
    const result = response.data?.data || {};
    const answers = (result.answers || []).filter(answer => answer.source !== 'unavailable');
    renderAiAnswerPanel(answers, result);
    setStatus('Đã nhận ' + answers.length + ' đáp án (' + (result.databaseCount || 0) + ' từ hệ thống, ' + (result.aiCount || 0) + ' từ AI).', 'success');
  } catch (error) {
    renderAiStatusPanel('Lỗi: ' + error.message, 'error');
    setStatus('Lỗi: ' + error.message, 'error');
  }
}
async function collectAttemptReviewQuestions() {
  const attemptId = getAttemptIdFromUrl();
  if (!attemptId) throw new Error('Kh\u00f4ng t\u00ecm th\u1ea5y m\u00e3 attempt tr\u00ean URL.');

  setStatus('\u0110ang t\u1ea3i c\u00e2u h\u1ecfi review trang 1...', 'loading');
  const firstPage = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '/review?page=1');
  const payload = firstPage?.data || firstPage || {};
  const totalPage = Number(payload.totalpage || firstPage.totalpage || 1) || 1;
  const questions = [...(payload.questions || firstPage.questions || [])];
  setStatus('\u0110\u00e3 t\u1ea3i trang 1/' + totalPage + ' - ' + questions.length + ' c\u00e2u h\u1ecfi.', 'loading');

  for (let page = 2; page <= totalPage; page += 1) {
    setStatus('\u0110ang t\u1ea3i trang ' + page + '/' + totalPage + ' - hi\u1ec7n c\u00f3 ' + questions.length + ' c\u00e2u...', 'loading');
    const pageJson = await fetchJson('https://lms-tvu.onschool.edu.vn/api/attempts/' + attemptId + '/review?page=' + page);
    const pagePayload = pageJson?.data || pageJson || {};
    questions.push(...(pagePayload.questions || pageJson.questions || []));
    setStatus('\u0110\u00e3 t\u1ea3i trang ' + page + '/' + totalPage + ' - ' + questions.length + ' c\u00e2u h\u1ecfi.', 'loading');
  }

  return { ...payload, questions, totalquestions: questions.length, totalpage: totalPage };
}

async function performAttemptReviewImport() {
  let progressTimer = null;
  try {
    setStatus('B\u1eaft \u0111\u1ea7u l\u1ea5y c\u00e2u h\u1ecfi t\u1eeb LMS...', 'loading');
    const reviewJson = await collectAttemptReviewQuestions();
    const questionCount = reviewJson.questions?.length || 0;
    const pageCount = reviewJson.totalpage || 1;
    const startedAt = Date.now();
    setStatus('\u0110\u00e3 l\u1ea5y ' + questionCount + ' c\u00e2u t\u1eeb ' + pageCount + ' trang. \u0110ang g\u1eedi l\u00ean h\u1ec7 th\u1ed1ng...', 'loading');
    progressTimer = setInterval(() => {
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setStatus('\u0110ang import ' + questionCount + ' c\u00e2u l\u00ean h\u1ec7 th\u1ed1ng... \u0111\u00e3 ch\u1edd ' + seconds + ' gi\u00e2y.', 'loading');
    }, 1000);
    const response = await chrome.runtime.sendMessage({ type: 'IMPORT_ATTEMPT_REVIEW_QUESTIONS', reviewJson });
    if (!response?.ok) throw new Error(response?.message || 'Kh\u00f4ng import \u0111\u01b0\u1ee3c c\u00e2u h\u1ecfi review.');
    const result = response.data?.data || {};
    const imageWarningCount = result.imageWarnings?.length || 0;
    const audioWarningCount = result.audioWarnings?.length || 0;
    const imageWarningText = imageWarningCount > 0 ? ' C\u00f3 ' + imageWarningCount + ' \u1ea3nh ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c.' : '';
    const audioWarningText = audioWarningCount > 0 ? ' C\u00f3 ' + audioWarningCount + ' \u00e2m thanh ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c.' : '';
    const duplicateCount = (result.skipped || []).filter(item => item.type === 'duplicate').length;
    const hasMediaWarning = imageWarningCount > 0 || audioWarningCount > 0;
    setStatus('\u0110\u00e3 import ' + (result.importedCount || 0) + '/' + questionCount + ' c\u00e2u h\u1ecfi. Tr\u00f9ng ' + duplicateCount + '.' + imageWarningText + audioWarningText, hasMediaWarning ? 'error' : 'success');
    showImportNotification(result, questionCount);
  } catch (error) {
    setStatus('L\u1ed7i: ' + error.message, 'error');
    showImportErrorNotification(error.message);
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
}

async function saveAttemptReviewQuestions() {
  if (reviewImportPromise) return reviewImportPromise;
  reviewImportPromise = performAttemptReviewImport();
  try {
    return await reviewImportPromise;
  } finally {
    reviewImportPromise = null;
  }
}

function autoImportReviewQuestions() {
  if (window.top !== window) return;
  const attemptId = getAttemptIdFromUrl();
  if (!attemptId) {
    autoImportedAttemptId = '';
    return;
  }
  if (autoImportedAttemptId === attemptId) return;
  autoImportedAttemptId = attemptId;
  setStatus('Đã nhận diện trang review. Chuẩn bị tự động import...', 'loading');
  setTimeout(() => {
    if (getAttemptIdFromUrl() === attemptId) saveAttemptReviewQuestions();
  }, 600);
}

function createFloatingButton() {
  if (window.top !== window) return;
  const currentWidget = document.querySelector('#lms-helper-widget');
  const reviewPage = isAttemptReviewPage();
  const liveAttemptPage = isLiveAttemptPage();
  if (!reviewPage && !liveAttemptPage) {
    if (currentWidget) currentWidget.remove();
    return;
  }

  const widgetType = reviewPage ? 'review' : 'solve';
  if (currentWidget?.dataset.widgetType === widgetType) return;
  if (currentWidget) currentWidget.remove();

  const widget = document.createElement('div');
  widget.id = 'lms-helper-widget';
  widget.dataset.widgetType = widgetType;
  widget.classList.add('lms-helper-widget--mini');
  if (reviewPage) {
    widget.innerHTML = '<button id="lms-helper-button" class="lms-helper-button lms-helper-button--question" type="button" title="Import câu hỏi review vào ngân hàng câu hỏi"><span>Lấy câu hỏi</span><small>Review</small></button><div id="lms-helper-status" data-type="info">Sẵn sàng.</div>';
  } else {
    widget.innerHTML = '<button id="lms-helper-button" class="lms-helper-button lms-helper-button--answer" type="button" title="Nhờ AI trả lời câu hỏi trong attempt"><span>AI đáp án</span><small>Attempt</small></button><div id="lms-helper-status" data-type="info">Sẵn sàng.</div>';
  }

  document.body.appendChild(widget);
  const handler = reviewPage ? saveAttemptReviewQuestions : solveLiveAttemptQuestions;
  document.querySelector('#lms-helper-button').addEventListener('click', handler);
}
createFloatingButton();
autoImportReviewQuestions();

function watchLmsNavigation() {
  let lastUrl = location.href;
  const refreshWidget = () => {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    setTimeout(() => {
      createFloatingButton();
      autoImportReviewQuestions();
    }, 250);
  };

  ['pushState', 'replaceState'].forEach(methodName => {
    const originalMethod = history[methodName];
    history[methodName] = function (...args) {
      const result = originalMethod.apply(this, args);
      refreshWidget();
      return result;
    };
  });

  window.addEventListener('popstate', refreshWidget);
  setInterval(refreshWidget, 1000);
}

watchLmsNavigation();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RUN_SOLVE_ATTEMPT_QUESTIONS') {
    if (!isLiveAttemptPage()) {
      sendResponse({ ok: false, message: 'Trang hiện tại không phải trang attempt đang làm bài.' });
      return false;
    }
    solveLiveAttemptQuestions();
    sendResponse({ ok: true, message: 'Đã bắt đầu nhờ AI trả lời attempt.' });
    return false;
  }

  if (message?.type === 'RUN_IMPORT_REVIEW_QUESTIONS') {
    if (!isAttemptReviewPage()) {
      sendResponse({ ok: false, message: 'Trang hiện tại không phải trang review câu hỏi.' });
      return false;
    }
    saveAttemptReviewQuestions();
    sendResponse({ ok: true, message: 'Đã bắt đầu import câu hỏi review.' });
    return false;
  }

  return false;
});













