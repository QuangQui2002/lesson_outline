import htmlToPdfmake from 'html-to-pdfmake';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mathDocument = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams'] }),
  OutputJax: new SVG({ fontCache: 'none' })
});

export async function convertPdfContent(html, imageCache, textColor) {
  const container = document.createElement('div');
  container.innerHTML = String(html || '');
  container.querySelectorAll('script, style, iframe, object, embed').forEach(node => node.remove());
  container.querySelectorAll('*').forEach(element => {
    [...element.attributes].forEach(attribute => {
      if (!['src', 'href', 'colspan', 'rowspan'].includes(attribute.name.toLowerCase())) element.removeAttribute(attribute.name);
    });
    if (element.hasAttribute('href') && !/^https?:\/\//i.test(element.getAttribute('href'))) element.removeAttribute('href');
  });
  container.querySelectorAll('audio').forEach(node => node.replaceWith(document.createTextNode('[Âm thanh]')));
  for (const imageNode of container.querySelectorAll('img')) {
    const image = await imageCache.get(imageNode.getAttribute('src'));
    if (!image) {
      imageNode.replaceWith(document.createTextNode('[Không tải được hình ảnh]'));
      continue;
    }
    imageNode.setAttribute('src', image.dataUrl);
    imageNode.setAttribute('width', String(image.dimensions.width));
    imageNode.setAttribute('height', String(image.dimensions.height));
  }
  const walker = document.createTreeWalker(container, 4);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    if (node.parentElement?.closest('pre, code')) continue;
    const pattern = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
    const value = node.nodeValue || '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
      const output = mathDocument.convert(match[1] ?? match[2], { display: match[2] !== undefined });
      const holder = document.createElement('div');
      holder.innerHTML = adaptor.innerHTML(output);
      const svg = holder.querySelector('svg');
      if (!svg || holder.querySelector('[data-mjx-error]')) {
        fragment.appendChild(document.createTextNode(match[0]));
      } else {
        const viewBox = svg.getAttribute('viewBox').split(/\s+/).map(Number);
        const width = Math.min(475, Math.max(1, viewBox[2] * 11 / 1000));
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(width * viewBox[3] / viewBox[2]));
        svg.querySelectorAll('[fill="currentColor"]').forEach(element => element.setAttribute('fill', textColor));
        svg.querySelectorAll('[stroke="currentColor"]').forEach(element => element.setAttribute('stroke', textColor));
        fragment.appendChild(svg);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
      node.replaceWith(fragment);
    }
  }
  return htmlToPdfmake(container.innerHTML, {
    window,
    defaultStyles: {
      table: { margin: [0, 6, 0, 8] },
      td: { margin: [4, 3, 4, 3] },
      th: { bold: true, margin: [4, 3, 4, 3] },
      p: { margin: [0, 0, 0, 6] }
    }
  });
}
