function htmlToPlainText(html = '') {
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
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const container = document.createElement('div');
  container.innerHTML = normalizedHtml;
  container.querySelectorAll('img').forEach(image => image.remove());

  return (container.textContent || '')
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

  const imageUrlPattern = /(?:data:image\/(?:png|jpe?g|gif|bmp|webp|svg\+xml)[^\s"'<>]*|https:\/\/[^\s<>'"]+?\.(?:png|jpe?g|gif|bmp|webp|svg)(?:\?[^\s<>'"]*)?)/gi;
  rawHtml.match(imageUrlPattern)?.forEach(source => sources.push(source));
  return [...new Set(sources.filter(Boolean))];
}

function getImageType(contentType = '', source = '') {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes('jpeg') || /\.jpe?g(?:\?|$)/i.test(source)) return 'jpg';
  if (normalizedType.includes('png') || /\.png(?:\?|$)/i.test(source)) return 'png';
  if (normalizedType.includes('gif') || /\.gif(?:\?|$)/i.test(source)) return 'gif';
  if (normalizedType.includes('bmp') || /\.bmp(?:\?|$)/i.test(source)) return 'bmp';
  return '';
}

async function getImageDimensions(blob) {
  if (typeof createImageBitmap !== 'function') return { width: 520, height: 300 };
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(520 / bitmap.width, 360 / bitmap.height, 1);
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
    if (!response.ok && /^https:\/\//i.test(source)) {
      response = await fetchWithTimeout(source, 'include');
    }
  } catch (error) {
    response = await fetchWithTimeout(source, 'include');
  }
  if (!response.ok) throw new Error('HTTP ' + response.status);

  let blob = await response.blob();
  let type = getImageType(blob.type, source);
  if (!type) {
    const pngBlob = await convertBlobToPng(blob);
    if (!pngBlob) throw new Error('Định dạng ảnh không được hỗ trợ');
    blob = pngBlob;
    type = 'png';
  }

  return {
    type,
    data: await blob.arrayBuffer(),
    transformation: await getImageDimensions(blob)
  };
}

async function preloadImages(questions, imageCache) {
  const sources = [...new Set(questions.flatMap(question => [
    ...extractImageSources(question.content),
    ...extractImageSources(question.answer)
  ]))];
  let nextIndex = 0;
  const workerCount = Math.min(4, sources.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < sources.length) {
      const source = sources[nextIndex];
      nextIndex += 1;
      const imagePromise = fetchImage(source);
      imageCache.set(source, imagePromise);
      try {
        await imagePromise;
      } catch (error) {}
    }
  }));
}

function textParagraphs(Paragraph, TextRun, text, options = {}) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) lines.push('(Không có nội dung)');

  return lines.map(line => new Paragraph({
    spacing: options.spacing || { after: 100, line: 276 },
    indent: options.indent,
    shading: options.shading,
    children: [new TextRun({ text: line, bold: options.bold, color: options.color })]
  }));
}

function removeDisplayedImageUrls(text, sources) {
  let cleaned = String(text || '');
  for (const source of sources) {
    const decodedSource = source.replace(/&amp;/gi, '&');
    cleaned = cleaned.split(source).join('').split(decodedSource).join('');
  }
  return cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function contentParagraphs({
  AlignmentType,
  ImageRun,
  Paragraph,
  TextRun,
  html,
  shading,
  imageCache
}) {
  const paragraphOptions = {
    indent: { left: 240, right: 120 },
    shading,
    spacing: { after: 100, line: 276 }
  };
  const sources = extractImageSources(html);
  const displayedImages = [];
  const failedSources = [];

  for (const source of sources) {
    if (!imageCache.has(source)) imageCache.set(source, fetchImage(source));
    try {
      const image = await imageCache.get(source);
      displayedImages.push({ source, image });
    } catch (error) {
      failedSources.push(source);
    }
  }

  const plainText = removeDisplayedImageUrls(
    htmlToPlainText(html),
    displayedImages.map(item => item.source)
  );
  const paragraphs = plainText
    ? textParagraphs(Paragraph, TextRun, plainText, paragraphOptions)
    : [];

  for (const { source, image } of displayedImages) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: paragraphOptions.indent,
      shading,
      spacing: { before: 80, after: 140 },
      children: [new ImageRun({
        ...image,
        altText: {
          name: 'Hình minh họa câu hỏi',
          title: 'Hình minh họa',
          description: source
        }
      })]
    }));
  }

  for (const source of failedSources) {
    paragraphs.push(new Paragraph({
      indent: paragraphOptions.indent,
      shading,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Hình ảnh: ' + source, italics: true, color: '64748B', size: 18 })]
    }));
  }

  if (paragraphs.length === 0) {
    return textParagraphs(Paragraph, TextRun, '', paragraphOptions);
  }

  return paragraphs;
}

function sortQuestions(questions, subjectNames) {
  return [...questions].sort((first, second) => {
    const subjectCompare = (subjectNames[first.subjectId] || '').localeCompare(
      subjectNames[second.subjectId] || '',
      'vi'
    );
    if (subjectCompare !== 0) return subjectCompare;

    const quizCompare = String(first.quizName || 'Khác').localeCompare(
      String(second.quizName || 'Khác'),
      'vi'
    );
    if (quizCompare !== 0) return quizCompare;
    return new Date(first.createdAt || 0) - new Date(second.createdAt || 0);
  });
}

export async function createQuestionsWordBlob({ questions, subjectNames, subjectLabel, quizLabel }) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    ImageRun,
    PageNumber,
    Packer,
    Paragraph,
    ShadingType,
    TextRun
  } = await import('docx');

  const sortedQuestions = sortQuestions(questions, subjectNames);
  const imageCache = new Map();
  await preloadImages(sortedQuestions, imageCache);
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      spacing: { after: 180 },
      children: [new TextRun({ text: 'NGÂN HÀNG CÂU HỎI', bold: true, size: 34, color: '1E3A8A' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: 'Môn: ' + subjectLabel, bold: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: 'Dạng bài tập: ' + quizLabel, bold: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: 'Tổng số: ' + sortedQuestions.length + ' câu hỏi', italics: true, color: '475569' })]
    })
  ];

  for (const [index, question] of sortedQuestions.entries()) {
    const subjectName = subjectNames[question.subjectId] || 'Môn học khác';
    const quizName = question.quizName || 'Khác';

    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 220, after: 100 },
      children: [new TextRun({ text: 'Câu ' + (index + 1), bold: true, color: '1D4ED8' })]
    }));
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: subjectName + ' | ' + quizName, italics: true, size: 18, color: '64748B' })]
    }));
    children.push(...await contentParagraphs({
      AlignmentType,
      ImageRun,
      Paragraph,
      TextRun,
      html: question.content,
      shading: { type: ShadingType.CLEAR, fill: 'EFF6FF', color: 'auto' },
      imageCache
    }));
    children.push(new Paragraph({
      keepNext: true,
      spacing: { before: 100, after: 70 },
      children: [new TextRun({ text: 'Đáp án:', bold: true, color: '15803D' })]
    }));
    children.push(...await contentParagraphs({
      AlignmentType,
      ImageRun,
      Paragraph,
      TextRun,
      html: question.answer,
      shading: { type: ShadingType.CLEAR, fill: 'F0FDF4', color: 'auto' },
      imageCache
    }));
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' } },
      spacing: { after: 120 },
      children: []
    }));
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22, color: '0F172A' },
          paragraph: { spacing: { line: 276 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
        }
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Trang ', color: '64748B', size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], color: '64748B', size: 18 })
            ]
          })]
        })
      },
      children
    }]
  });

  return Packer.toBlob(document);
}
