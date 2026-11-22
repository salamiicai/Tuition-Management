// Visual effects: theme, animated ring, sparkline, count-up, confetti. No dependencies.
let uid = 0;

export function initTheme() {
  const saved = localStorage.getItem('ht_theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ht_theme', next); } catch { /* ignore */ }
}

// Progress ring. value/max → arc. `center` and `sub` are trusted HTML (callers escape).
export function ringSvg({ value = 0, max = 1, size = 150, stroke = 12, center = '', sub = '' }) {
  const id = 'g' + (++uid);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#6D5EF5"/></linearGradient></defs>
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none" stroke="url(#${id})" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="--c:${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-center"><div class="ring-num">${center}</div>${sub ? `<div class="ring-sub">${sub}</div>` : ''}</div></div>`;
}

// Tiny area chart for a list of numbers (0-100).
export function sparkline(values, w = 320, h = 90) {
  if (values.length < 2) return '';
  const id = 's' + (++uid), pad = 8;
  const pts = values.map((v, i) => [pad + i * (w - 2 * pad) / (values.length - 1), h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - 2 * pad)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]} ${h} L${pts[0][0]} ${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6D5EF5" stop-opacity=".35"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/><path class="spark-line" d="${line}" fill="none" stroke="#6D5EF5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="#6D5EF5" stroke-width="2"/>`).join('')}</svg>`;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function countUp(root = document) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count) || 0;
    if (reduced() || to === 0) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 700;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function confetti(n = 110) {
  if (reduced()) return;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:300';
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const cols = ['#6D5EF5', '#22D3EE', '#FF7A59', '#34D399', '#FBBF24'];
  const ps = Array.from({ length: n }, () => ({
    x: cv.width / 2, y: cv.height * 0.35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 3,
    s: 5 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .4
  }));
  let f = 0;
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => {
      p.vy += .38; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - f / 110); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore();
    });
    if (++f < 110) requestAnimationFrame(tick); else cv.remove();
  })();
}
