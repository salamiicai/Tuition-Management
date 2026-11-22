// Pure converters: old ("legacy") data  →  new structure. No Firebase here (testable in Node).
import { hashText, normalizeText, emptyAttendance } from './utils.js';

// Dates may arrive as ISO string, {__ts: iso} (from the export tool) or {seconds}.
export function isoOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.__ts) return v.__ts;
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return '';
}

export function stripUndefined(v) {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = stripUndefined(v[k]);
    return o;
  }
  return v;
}

export function legacyStudentToNew(id, d, token) {
  const att = d.attendance && typeof d.attendance === 'object' ? d.attendance : emptyAttendance();
  return stripUndefined({
    name: d.studentName || id,
    school: d.studentSchool || '',
    className: d.className || '',
    guardianNumber: d.guardianNumber || '',
    waStudent: d.waNumberStudent || '',
    token,
    attendance: {
      currentMonthNumber: att.currentMonthNumber ?? null,
      currentMonthStartDate: att.currentMonthStartDate ?? null,
      months: Array.isArray(att.months) ? att.months : []
    },
    creditsBase: Number(d.totalCredits) || 0,   // old Nano credits carry over as a starting balance
    legacyUsername: id,
    createdAt: isoOf(d.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function legacyMaterialToNew(d) {
  return stripUndefined({
    title: d.title || 'Untitled',
    type: d.type || 'Note',
    subject: d.subject || '',
    link: d.link || '',
    studentIds: d.studentUsername ? [d.studentUsername] : [],
    createdAt: isoOf(d.createdAt) || new Date().toISOString()
  });
}

const num = v => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v));

export function legacyPct(sub) {
  if (num(sub.overallPercentage) !== null) return Math.round(Number(sub.overallPercentage));
  const ft = num(sub.finalTotal);
  const tm = num(sub.totalMark) ?? num(sub.totalMarks) ?? num(sub.finalTotalMax);
  if (ft !== null && tm && tm > 0) return Math.round((ft / tm) * 100);
  const ms = num(sub.mcqScore), mt = num(sub.mcqTotal);
  if (ms !== null && mt && mt > 0) return Math.round((ms / mt) * 100);
  return num(sub.mcqPercentage);
}

// What the student sees on the Results tab for an old online exam.
export function legacyResultDoc(sub) {
  let scoreText = '';
  if (num(sub.finalTotal) !== null) scoreText = `${sub.finalTotal} marks`;
  else if (num(sub.mcqScore) !== null) scoreText = `${sub.mcqScore}/${sub.mcqTotal ?? '?'}`;
  return stripUndefined({
    title: sub.examName || 'Exam',
    code: sub.questionCode || '',
    date: isoOf(sub.submittedAt),
    status: sub.status === 'FINAL_PUBLISHED' ? 'final' : 'pending',
    pct: legacyPct(sub),
    scoreText,
    kind: 'legacy'
  });
}

// Old gamified question  →  Nano Library question (single language per question).
export function convertGamifiedQuestion(exam, examId, q) {
  const lang = exam.langMode === 'en' ? 'en' : 'bn';
  const pick = (bn, en) => (lang === 'bn' ? (bn || en || '') : (en || bn || ''));
  const base = {
    class: exam.className || '',
    subject: exam.subject || '',
    version: lang,
    chapter: 'Imported',
    topic: exam.title || '',
    q: pick(q.textBn, q.textEn),
    explain: '',
    qImage: '',
    status: 'published',
    source: `legacy:${examId}`,
    timerSeconds: Number(q.timerSeconds) || 0
  };
  let out = null;
  switch (q.type) {
    case 'mcq': {
      const options = {};
      for (const L of ['A', 'B', 'C', 'D']) options[L] = pick(q.options?.[L]?.bn, q.options?.[L]?.en);
      out = { ...base, type: 'mcq', options, answer: q.correct };
      break;
    }
    case 'truefalse':
      out = { ...base, type: 'tf', answer: q.correct === 'true' ? 'true' : 'false' };
      break;
    case 'fillblank':
      out = { ...base, type: 'fill', answer: pick(q.correctAnswerBn, q.correctAnswerEn) };
      break;
    case 'matching':
      out = { ...base, type: 'match', pairs: (q.pairs || []).map(p => ({ l: pick(p.lBn, p.lEn), r: pick(p.rBn, p.rEn) })) };
      break;
    case 'ordering':
      out = {
        ...base, type: 'order',
        items: (q.items || []).slice().sort((a, b) => (a.correctPos || 0) - (b.correctPos || 0)).map(i => pick(i.bn, i.en))
      };
      break;
    default: return null;
  }
  if (!out.q) return null;
  out.hash = hashText(normalizeText(out.type + '|' + out.q + '|' + (out.answer ?? '')));
  return stripUndefined(out);
}
