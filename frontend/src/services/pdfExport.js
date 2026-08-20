function decodeHtmlText(html = '') {
  const normalizedHtml = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');

  if (typeof document === 'undefined') {
    return normalizedHtml
      .replace(/<img[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  const container = document.createElement('div');
  container.innerHTML = normalizedHtml;
  container.querySelectorAll('img').forEach(image => image.remove());
  return container.textContent || '';
}

function formatLatexExpression(expression = '') {
  const matrixMatch = String(expression).match(/\\begin\{(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}/);
  if (matrixMatch) {
    return matrixMatch[1]
      .split(/\\\\/)
      .map(row => '[ ' + row.split('&').map(cell => formatLatexExpression(cell)).join('   ') + ' ]')
      .join('\n');
  }

  return String(expression || '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\sum/g, '∑')
    .replace(/\\prod/g, '∏')
    .replace(/\\in/g, '∈')
    .replace(/\\notin/g, '∉')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\pm/g, '±')
    .replace(/\^\{\+\}/g, '⁺')
    .replace(/\^\{-\}/g, '⁻')
    .replace(/_\{([^{}]+)\}/g, '($1)')
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToPdfText(html = '') {
  return decodeHtmlText(html)
    .replace(/\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g, (match, inlineExpression, displayExpression) => {
      return formatLatexExpression(inlineExpression ?? displayExpression ?? '');
    })
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractImageSources(html = '') {
  const rawHtml = String(html || '');
  const sources = [];
  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = rawHtml;
    container.querySelectorAll('img[src]').forEach(image => sources.push(image.getAttribute('src')));
  } else {
    rawHtml.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, source) => {
      sources.push(source);
      return match;
    });
  }
  return [...new Set(sources.filter(Boolean))];
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Không đọc được hình ảnh.'));
    reader.readAsDataURL(blob);
  });
}

async function getImageDimensions(blob) {
  if (typeof createImageBitmap !== 'function') return { width: 400, height: 240 };
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(400 / bitmap.width, 260 / bitmap.height, 1);
  const dimensions = {
    width: Math.max(1, Math.round(bitmap.width * ratio)),
    height: Math.max(1, Math.round(bitmap.height * ratio))
  };
  bitmap.close?.();
  return dimensions;
}

async function convertBlobToPng(blob) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function fetchWithTimeout(source, credentials) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(source, { credentials, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchImage(source) {
  let response;
  try {
    response = await fetchWithTimeout(source, 'omit');
    if (!response.ok && /^https:\/\//i.test(source)) response = await fetchWithTimeout(source, 'include');
  } catch (error) {
    response = await fetchWithTimeout(source, 'include');
  }
  if (!response.ok) throw new Error('HTTP ' + response.status);

  let blob = await response.blob();
  if (!/^image\/(png|jpeg)$/i.test(blob.type)) {
    const pngBlob = await convertBlobToPng(blob);
    if (!pngBlob) throw new Error('Định dạng ảnh không được hỗ trợ.');
    blob = pngBlob;
  }
  return {
    dataUrl: await blobToDataUrl(blob),
    dimensions: await getImageDimensions(blob)
  };
}

async function preloadImages(questions) {
  const sources = [...new Set(questions.flatMap(question => [
    ...extractImageSources(question.content),
    ...extractImageSources(question.answer)
  ]))];
  const imageCache = new Map();
  let nextIndex = 0;
  const workerCount = Math.min(4, sources.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < sources.length) {
      const source = sources[nextIndex];
      nextIndex += 1;
      const imagePromise = fetchImage(source).catch(() => null);
      imageCache.set(source, imagePromise);
      await imagePromise;
    }
  }));
  return imageCache;
}

function sortQuestions(questions, subjectNames) {
  return [...questions].sort((first, second) => {
    const subjectCompare = (subjectNames[first.subjectId] || '').localeCompare(subjectNames[second.subjectId] || '', 'vi');
    if (subjectCompare !== 0) return subjectCompare;
    const quizCompare = String(first.quizName || 'Khác').localeCompare(String(second.quizName || 'Khác'), 'vi');
    if (quizCompare !== 0) return quizCompare;
    return new Date(first.createdAt || 0) - new Date(second.createdAt || 0);
  });
}

async function buildPdfSection(html, imageCache, fillColor, textColor) {
  const stack = [];
  const text = htmlToPdfText(html);
  if (text) stack.push({ text, color: textColor, lineHeight: 1.35 });

  const failedImages = [];
  for (const source of extractImageSources(html)) {
    const image = await imageCache.get(source);
    if (!image) {
      failedImages.push(source);
      continue;
    }
    stack.push({
      image: image.dataUrl,
      width: image.dimensions.width,
      height: image.dimensions.height,
      alignment: 'center',
      margin: [0, 7, 0, 3]
    });
  }

  if (failedImages.length > 0) {
    stack.push({ text: 'Có ' + failedImages.length + ' hình ảnh không tải được.', italics: true, color: '#64748B', fontSize: 9 });
  }
  if (stack.length === 0) stack.push({ text: '(Không có nội dung)', italics: true, color: '#64748B' });

  return {
    table: {
      widths: ['*'],
      body: [[{ stack, fillColor, margin: [10, 8, 10, 8] }]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 8]
  };
}

async function loadPdfMake() {
  const [pdfMakeModule, fontModule] = await Promise.all([
    import('pdfmake/build/pdfmake.js'),
    import('pdfmake/build/vfs_fonts.js')
  ]);
  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const fontExport = fontModule.default || fontModule;
  pdfMake.vfs = fontExport.pdfMake?.vfs || fontExport.vfs || fontExport;
  return pdfMake;
}

export async function createQuestionsPdfBlob({ questions, subjectNames, subjectLabel, quizLabel }) {
  const sortedQuestions = sortQuestions(questions, subjectNames);
  const imageCache = await preloadImages(sortedQuestions);
  const content = [
    { text: 'NGÂN HÀNG CÂU HỎI', style: 'title' },
    { text: 'Môn: ' + subjectLabel, style: 'summary' },
    { text: 'Dạng bài tập: ' + quizLabel, style: 'summary' },
    { text: 'Tổng số: ' + sortedQuestions.length + ' câu hỏi', style: 'total' }
  ];

  for (const [index, question] of sortedQuestions.entries()) {
    const subjectName = subjectNames[question.subjectId] || 'Môn học khác';
    const quizName = question.quizName || 'Khác';
    content.push({ text: 'Câu ' + (index + 1), style: 'questionTitle', headlineLevel: 1 });
    content.push({ text: subjectName + ' | ' + quizName, style: 'metadata' });
    content.push(await buildPdfSection(question.content, imageCache, '#EFF6FF', '#0F172A'));
    content.push({ text: 'ĐÁP ÁN', style: 'answerLabel' });
    content.push(await buildPdfSection(question.answer, imageCache, '#F0FDF4', '#166534'));
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 511, y2: 0, lineWidth: 0.7, lineColor: '#CBD5E1' }], margin: [0, 5, 0, 7] });
  }

  const pdfMake = await loadPdfMake();
  const documentDefinition = {
    pageSize: 'A4',
    pageMargins: [42, 48, 42, 48],
    info: {
      title: 'Ngân hàng câu hỏi - ' + subjectLabel,
      subject: quizLabel,
      creator: 'Lesson Outline'
    },
    footer(currentPage, pageCount) {
      return { text: 'Trang ' + currentPage + '/' + pageCount, alignment: 'center', color: '#64748B', fontSize: 9, margin: [0, 14, 0, 0] };
    },
    content,
    defaultStyle: { font: 'Roboto', fontSize: 11, color: '#0F172A', lineHeight: 1.25 },
    styles: {
      title: { fontSize: 20, bold: true, color: '#1E3A8A', alignment: 'center', margin: [0, 0, 0, 12] },
      summary: { bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      total: { italics: true, color: '#475569', alignment: 'center', margin: [0, 0, 0, 18] },
      questionTitle: { fontSize: 14, bold: true, color: '#1D4ED8', margin: [0, 10, 0, 3] },
      metadata: { fontSize: 9, italics: true, color: '#64748B', margin: [0, 0, 0, 7] },
      answerLabel: { fontSize: 10, bold: true, color: '#15803D', margin: [0, 2, 0, 4] }
    }
  };

  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(documentDefinition).getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
}
