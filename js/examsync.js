// Publishes exams / results into each student's private view (studentViews/{token}/…).
import { db, doc, collection, getDocs } from './firebase.js';
import { batchWrite, viewRef } from './viewsync.js';
import { snapshotQuestion } from './nano.js';

export const nanoSnapshot = (exam, library) => {
  const questions = exam.questionIds.map(id => library.find(q => q.id === id)).filter(Boolean).map(q => snapshotQuestion(q.id, q));
  return {
    title: exam.title, totalMinutes: exam.totalMinutes, points: exam.points, penalty: exam.penalty || 0,
    total: questions.length, maxCredits: questions.length * exam.points,
    createdAt: exam.createdAt, questions
  };
};

export async function syncNanoExam(exam, library, students, prevIds = []) {
  const snap = nanoSnapshot(exam, library);
  if (JSON.stringify(snap).length > 900000) throw new Error('This exam is too large. Use fewer questions or smaller images.');
  const ops = [];
  for (const s of students) {
    if (!s.token) continue;
    const ref = viewRef(s.token, 'nano', exam.id);
    if ((exam.studentIds || []).includes(s.id)) ops.push({ type: 'set', ref, data: snap });
    else if (prevIds.includes(s.id)) ops.push({ type: 'delete', ref });
  }
  await batchWrite(ops);
  return snap.total;
}

export async function removeNanoExam(exam, students) {
  await batchWrite(students.filter(s => s.token && (exam.studentIds || []).includes(s.id))
    .map(s => ({ type: 'delete', ref: viewRef(s.token, 'nano', exam.id) })));
}

export const offlineResultDoc = (exam, m) => {
  const mcq = exam.hasMcq ? Number(m.mcq) || 0 : 0, written = exam.hasWritten ? Number(m.written) || 0 : 0;
  const full = (exam.hasMcq ? exam.mcqFull : 0) + (exam.hasWritten ? exam.writtenFull : 0);
  const total = mcq + written;
  return {
    title: exam.title, subject: exam.subject || '', date: exam.date ? new Date(exam.date + 'T12:00:00').toISOString() : exam.createdAt,
    status: 'final', kind: 'offline', mcq: exam.hasMcq ? mcq : null, written: exam.hasWritten ? written : null,
    total, full, pct: full > 0 ? Math.round(total / full * 100) : null, scoreText: `${total}/${full}`
  };
};
export const hasMarks = (exam, m) => !!m && ((exam.hasMcq && m.mcq !== '' && m.mcq != null) || (exam.hasWritten && m.written !== '' && m.written != null));

export async function syncOfflineExam(exam, students, prevIds = []) {
  const ops = [];
  for (const s of students) {
    if (!s.token) continue;
    const ref = viewRef(s.token, 'results', 'offline_' + exam.id);
    const m = (exam.marks || {})[s.id];
    if ((exam.studentIds || []).includes(s.id) && hasMarks(exam, m)) ops.push({ type: 'set', ref, data: offlineResultDoc(exam, m) });
    else if (prevIds.includes(s.id) || (exam.studentIds || []).includes(s.id)) ops.push({ type: 'delete', ref });
  }
  await batchWrite(ops);
}
export async function removeOfflineExam(exam, students) {
  await batchWrite(students.filter(s => s.token).map(s => ({ type: 'delete', ref: viewRef(s.token, 'results', 'offline_' + exam.id) })));
}

export async function readAttempts(token) {
  return (await getDocs(collection(db, 'studentViews', token, 'attempts'))).docs.map(d => ({ id: d.id, ...d.data() }));
}
