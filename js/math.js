// Safe rich text: escapes everything, renders $…$ and $$…$$ with KaTeX when it is loaded.
import { esc, driveImageUrl, isHttpUrl } from './utils.js';

export function richHtml(text) {
  const parts = String(text ?? '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return parts.map(p => {
    const block = p.startsWith('$$') && p.endsWith('$$') && p.length > 4;
    const inline = !block && p.startsWith('$') && p.endsWith('$') && p.length > 2;
    if ((block || inline) && window.katex) {
      try { return window.katex.renderToString(p.slice(block ? 2 : 1, block ? -2 : -1), { displayMode: block, throwOnError: false }); }
      catch { /* fall through */ }
    }
    return esc(p).replace(/\n/g, '<br>');
  }).join('');
}

export function imgHtml(link, alt = '') {
  if (!link) return '';
  const url = driveImageUrl(link);
  if (!isHttpUrl(url)) return '';
  return `<img class="qimg" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`;
}
