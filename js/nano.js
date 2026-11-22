// Nano Library: pure helpers (no Firebase, no DOM) so they can be unit-tested.
import { hashText, normalizeText } from './utils.js';

export const CLASSES = [
  ['5', 'Class 5'], ['6', 'Class 6'], ['7', 'Class 7'], ['8', 'Class 8'],
  ['SSC', 'SSC (9/10/Final Prep)'], ['HSC', 'HSC (11/12/Admission)'], ['SAT', 'SAT']
];
export const classLabel = v => (CLASSES.find(c => c[0] === String(v)) || [0, v || '—'])[1];
export const TYPES = { mcq: 'MCQ', tf: 'True / False', fill: 'Fill in the blank', match: 'Matching', order: 'Ordering' };
export const VERSIONS = { bn: 'বাংলা', en: 'English' };

const v = x => String(x ?? '').trim();
const TYPE_ALIAS = {
  mcq: 'mcq', tf: 'tf', truefalse: 'tf', true_false: 'tf', 'true/false': 'tf',
  fill: 'fill', fillblank: 'fill', fill_blank: 'fill', fillintheblank: 'fill',
  match: 'match', matching: 'match', order: 'order', ordering: 'order'
};
const VERSION_ALIAS = { bn: 'bn', bangla: 'bn', bengali: 'bn', 'বাংলা': 'bn', en: 'en', english: 'en' };
const CLASS_ALIAS = { '5': '5', '6': '6', '7': '7', '8': '8', 'class 5': '5', 'class 6': '6', 'class 7': '7', 'class 8': '8',
  '9': 'SSC', '10': 'SSC', 'class 9': 'SSC', 'class 10': 'SSC', ssc: 'SSC', '11': 'HSC', '12': 'HSC', hsc: 'HSC', sat: 'SAT' };

export function normClass(x) {
  const k = v(x).toLowerCase();
  if (CLASS_ALIAS[k]) return CLASS_ALIAS[k];
  const up = v(x).toUpperCase();
  return CLASSES.some(c => c[0] === up) ? up : '';
}

export function questionHash(q) {
  return hashText([q.class, normalizeText(q.subject), q.version, normalizeText(q.q)].join('|'));
}

/** raw → { ok, errors[], q } . `defaults` fills missing class/subject/version/chapter/topic. */
export function normalizeQuestion(raw, defaults = {}) {
  const errors = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const q = {
    class: normClass(r.class ?? defaults.class),
    subject: v(r.subject ?? defaults.subject),
    version: VERSION_ALIAS[v(r.version ?? defaults.version).toLowerCase()] || '',
    chapter: v(r.chapter ?? defaults.chapter),
    topic: v(r.topic ?? defaults.topic),
    type: TYPE_ALIAS[v(r.type).toLowerCase()] || '',
    q: v(r.q ?? r.question),
    qImage: v(r.qImage), explain: v(r.explain ?? r.explanation), explainImage: v(r.explainImage)
  };
  if (!q.class) errors.push('class missing/invalid');
  if (!q.subject) errors.push('subject missing');
  if (!q.version) errors.push('version must be bn or en');
  if (!q.chapter) errors.push('chapter missing');
  if (!q.type) errors.push('type must be mcq, tf, fill, match or order');
  if (!q.q && !q.qImage) errors.push('question text missing');

  if (q.type === 'mcq') {
    const opts = (Array.isArray(r.options) ? r.options : []).map(v);
    if (opts.length < 2 || opts.length > 6 || opts.some(o => !o)) errors.push('mcq needs 2–6 non-empty options');
    let a = r.answer, idx = -1;
    if (typeof a === 'string' && /^[A-Fa-f]$/.test(a.trim())) idx = a.trim().toUpperCase().charCodeAt(0) - 65;
    else if (a !== undefined && a !== '' && !isNaN(Number(a))) idx = Number(a) - 1;   // 1-based number
    if (idx < 0 || idx >= opts.length) errors.push('mcq answer must be a letter A–F');
    q.options = opts; q.answer = idx;
  } else if (q.type === 'tf') {
    const s = v(r.answer).toLowerCase();
    if (r.answer === true || ['true', 't', 'yes', 'সত্য'].includes(s)) q.answer = true;
    else if (r.answer === false || ['false', 'f', 'no', 'মিথ্যা'].includes(s)) q.answer = false;
    else errors.push('tf answer must be true or false');
  } else if (q.type === 'fill') {
    const a = (Array.isArray(r.answer) ? r.answer : String(r.answer ?? '').split('|')).map(v).filter(Boolean);
    if (!a.length) errors.push('fill needs an answer');
    q.answer = a;
  } else if (q.type === 'match') {
    const pairs = (Array.isArray(r.pairs) ? r.pairs : []).map(p => Array.isArray(p) ? { l: v(p[0]), r: v(p[1]) } : { l: v(p?.l), r: v(p?.r) });
    if (pairs.length < 2 || pairs.length > 8 || pairs.some(p => !p.l || !p.r)) errors.push('match needs 2–8 pairs, none empty');
    q.pairs = pairs;
  } else if (q.type === 'order') {
    const items = (Array.isArray(r.items) ? r.items : []).map(v);
    if (items.length < 2 || items.length > 8 || items.some(i => !i)) errors.push('order needs 2–8 non-empty items (in the correct order)');
    q.items = items;
  }
  q.hash = questionHash(q);
  return { ok: errors.length === 0, errors, q };
}

/** Is the student's response right? Response formats: see js/exam.js */
export function gradeQuestion(q, resp) {
  if (resp === undefined || resp === null) return false;
  switch (q.type) {
    case 'mcq': return resp === q.answer;
    case 'tf': return resp === q.answer;
    case 'fill': { const s = normalizeText(resp); return !!s && q.answer.some(a => normalizeText(a) === s); }
    case 'match': return Array.isArray(resp) && resp.length === q.pairs.length && resp.every((x, i) => x === i);
    case 'order': return Array.isArray(resp) && resp.length === q.items.length && resp.every((x, i) => x === i);
    default: return false;
  }
}
export const isAnswered = (q, resp) => {
  if (resp === undefined || resp === null) return false;
  if (q.type === 'fill') return String(resp).trim() !== '';
  if (q.type === 'match') return Array.isArray(resp) && resp.every(x => x !== null && x !== undefined);
  if (q.type === 'order') return Array.isArray(resp) && resp.length === q.items.length;
  return true;
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Question as stored inside a student's exam snapshot (compact).
export function snapshotQuestion(id, q) {
  const o = { id, type: q.type, version: q.version, q: q.q || '', explain: q.explain || '' };
  if (q.qImage) o.qImage = q.qImage;
  if (q.explainImage) o.explainImage = q.explainImage;
  if (q.type === 'mcq') { o.options = q.options; o.answer = q.answer; }
  else if (q.type === 'tf' || q.type === 'fill') o.answer = q.answer;
  else if (q.type === 'match') o.pairs = q.pairs;
  else if (q.type === 'order') o.items = q.items;
  return o;
}

export const AI_PROMPT = `You are a formatter. Convert the questions I paste below into ONE valid JSON array (no markdown, no commentary).
Each item must follow exactly this shape:

{
  "class": "5|6|7|8|SSC|HSC|SAT",
  "subject": "Physics",
  "version": "bn" or "en",
  "chapter": "Chapter name",
  "topic": "Topic name (can be empty)",
  "type": "mcq" | "tf" | "fill" | "match" | "order",
  "q": "Question text. Use LaTeX inside $...$ for formulas, e.g. $v = u + at$",
  "qImage": "optional public image link (Google Drive share link ok)",
  "options": ["A text", "B text", "C text", "D text"],      // mcq only (2-6)
  "answer": "B",            // mcq: letter | tf: true/false | fill: "text" or ["alt1","alt2"]
  "pairs": [["left1","right1"],["left2","right2"]],         // match only
  "items": ["first","second","third"],                       // order only, in the CORRECT order
  "explain": "Optional explanation (LaTeX ok)",
  "explainImage": "optional public image link"
}

Rules: keep the original language of each question; never invent questions; leave out fields that do not apply; output JSON only.

QUESTIONS:
`;
