// Pure helpers. No Firebase import and no DOM access at import time,
// so this file can be unit-tested in Node.

export const pad2 = n => String(n).padStart(2, '0');

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

// ── Private-link tokens ─────────────────────────────────────
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function randomToken(len = 24) {
  let out = '';
  const limit = 256 - (256 % 62); // rejection sampling → no modulo bias
  while (out.length < len) {
    const buf = new Uint8Array(len * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit) {
        out += B62[b % 62];
        if (out.length === len) break;
      }
    }
  }
  return out;
}
export const isValidToken = t => /^[A-Za-z0-9]{16,64}$/.test(t || '');

// ── Phone / WhatsApp ────────────────────────────────────────
export function sanitizePhone(input) {
  const raw = String(input || '').trim();
  const d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    if (d.length >= 10 && d.length <= 15) return '+' + d;
  } else {
    if (d.length === 11 && d.startsWith('01')) return '+88' + d;
    if (d.length === 13 && d.startsWith('8801')) return '+' + d;
    if (d.length === 10 && d.startsWith('1')) return '+880' + d;
  }
  throw new Error('Invalid phone number. Use 01XXXXXXXXX (or +countrycode…).');
}
export const waDigits = n => String(n || '').replace(/\D/g, '');
export const waLink = (number, text) =>
  `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
export function maskPhone(n) {
  const d = waDigits(n);
  if (d.length < 7) return n || '—';
  return `${d.slice(0, 5)}*****${d.slice(-3)}`;
}

// ── Dates (all "YYYY-MM-DD" strings are treated as LOCAL dates) ──
export function todayYMD() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}
export function isValidYMD(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
export function fmtYMD(s) {
  if (!isValidYMD(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}
export function fmtISODate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return fmtYMD(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
}

// ── Links ───────────────────────────────────────────────────
export const isHttpUrl = u => {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; }
  catch { return false; }
};
export function driveFileId(link) {
  const s = String(link || '');
  const m = s.match(/\/file\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/\/d\/([\w-]{10,})/);
  return m ? m[1] : null;
}
// Google Drive share link → embeddable image URL (file must be "Anyone with the link").
export function driveImageUrl(link) {
  const id = driveFileId(link);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : String(link || '');
}

// ── Templates ───────────────────────────────────────────────
export const fillTemplate = (tpl, vars) =>
  String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

// ── Misc ────────────────────────────────────────────────────
export function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '--';
}
export const emptyAttendance = () => ({ currentMonthNumber: null, currentMonthStartDate: null, months: [] });

export function listDates(days, fmt, max = 12) {
  const shown = (days || []).slice(0, max).map(d => fmt(d.date)).join(', ');
  return shown + ((days || []).length > max ? ' …' : '');
}

// Small fast string hash (cyrb53) used for duplicate-question detection.
export function hashText(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const normalizeText = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
