// Student pages never read the private `students` collection.
// Instead the teacher app publishes a safe copy under  studentViews/{token}/…
// (no phone numbers, no answer keys). Everything that writes student-visible
// data goes through this file.
import { db, doc, collection, getDocs, writeBatch } from './firebase.js';
import { emptyAttendance } from './utils.js';
import { legacyResultDoc } from './convert.js';
import { nanoSnapshot, offlineResultDoc, hasMarks } from './examsync.js';

export const VIEW_SUBS = ['materials', 'results', 'nano', 'attempts'];

export async function batchWrite(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'delete') b.delete(op.ref);
      else if (op.merge) b.set(op.ref, op.data, { merge: true });
      else b.set(op.ref, op.data);
    }
    await b.commit();
  }
}

export function viewData(s) {
  return {
    name: s.name || '',
    className: s.className || '',
    school: s.school || '',
    attendance: s.attendance || emptyAttendance(),
    creditsBase: Number(s.creditsBase) || 0,
    updatedAt: new Date().toISOString()
  };
}
export const materialViewData = m => ({
  title: m.title, type: m.type, subject: m.subject || '', description: m.description || '', link: m.link, createdAt: m.createdAt || ''
});

export const viewRef = (token, ...path) => doc(db, 'studentViews', token, ...path);

export async function syncStudentView(s) {
  await batchWrite([{ type: 'set', ref: doc(db, 'studentViews', s.token), data: viewData(s) }]);
}

export async function syncMaterialToViews(material, students, prevIds = []) {
  const ops = [];
  const ids = material.studentIds || [];
  for (const s of students) {
    if (!s.token) continue;
    const ref = viewRef(s.token, 'materials', material.id);
    if (ids.includes(s.id)) ops.push({ type: 'set', ref, data: materialViewData(material) });
    else if (prevIds.includes(s.id)) ops.push({ type: 'delete', ref });
  }
  await batchWrite(ops);
}

export async function deleteStudentView(token) {
  const ops = [];
  for (const sub of VIEW_SUBS) {
    const snap = await getDocs(collection(db, 'studentViews', token, sub));
    snap.docs.forEach(d => ops.push({ type: 'delete', ref: d.ref }));
  }
  ops.push({ type: 'delete', ref: doc(db, 'studentViews', token) });
  await batchWrite(ops);
}

// Re-creates every student page from the master data. Safe to run any time.
export async function rebuildAllViews(onProgress = () => {}) {
  const read = async name => (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }));
  const [students, materials, legacy, nanoExams, offline, library] = await Promise.all([read('students'), read('materials'), read('legacySubmissions'), read('nanoExams'), read('offlineExams'), read('nanoQuestions')]);
  let n = 0;
  for (const s of students) {
    if (!s.token) continue;
    const ops = [{ type: 'set', ref: doc(db, 'studentViews', s.token), data: viewData(s) }];

    // materials
    const wantM = new Map(materials.filter(m => (m.studentIds || []).includes(s.id)).map(m => [m.id, materialViewData(m)]));
    (await getDocs(collection(db, 'studentViews', s.token, 'materials'))).docs
      .forEach(d => { if (!wantM.has(d.id)) ops.push({ type: 'delete', ref: d.ref }); });
    wantM.forEach((data, id) => ops.push({ type: 'set', ref: viewRef(s.token, 'materials', id), data }));

    // results (old online exams for now; offline exams are added in the next phase)
    const wantR = new Map(legacy.filter(x => x.studentId === s.id).map(x => [x.id, legacyResultDoc(x)]));
    offline.filter(e => (e.studentIds || []).includes(s.id) && hasMarks(e, (e.marks || {})[s.id]))
      .forEach(e => wantR.set('offline_' + e.id, offlineResultDoc(e, e.marks[s.id])));

    // nano exams
    const wantN = new Map(nanoExams.filter(e => (e.studentIds || []).includes(s.id)).map(e => [e.id, nanoSnapshot(e, library)]));
    (await getDocs(collection(db, 'studentViews', s.token, 'nano'))).docs
      .forEach(d => { if (!wantN.has(d.id)) ops.push({ type: 'delete', ref: d.ref }); });
    wantN.forEach((data, id) => ops.push({ type: 'set', ref: viewRef(s.token, 'nano', id), data }));
    (await getDocs(collection(db, 'studentViews', s.token, 'results'))).docs
      .forEach(d => { if (!wantR.has(d.id)) ops.push({ type: 'delete', ref: d.ref }); });
    wantR.forEach((data, id) => ops.push({ type: 'set', ref: viewRef(s.token, 'results', id), data }));

    await batchWrite(ops);
    onProgress(++n, students.length, s.name);
  }
  return n;
}
