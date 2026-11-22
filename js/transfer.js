// Backup / restore and import of the OLD system's export file.
import { db, doc, collection, getDocs, Timestamp } from './firebase.js';
import { batchWrite } from './viewsync.js';
import { randomToken } from './utils.js';
import {
  legacyStudentToNew, legacyMaterialToNew, convertGamifiedQuestion, stripUndefined
} from './convert.js';

export const BACKUP_COLLECTIONS = [
  'students', 'materials', 'public', 'config',
  'legacySubmissions', 'nanoQuestions', 'nanoExams', 'offlineExams', 'messages'
];

// Timestamps ⇄ {"__ts": iso} so everything survives JSON.
function encode(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(encode);
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k]); return o; }
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__ts') return Timestamp.fromDate(new Date(v.__ts));
    const o = {}; for (const k of keys) o[k] = decode(v[k]); return o;
  }
  return v;
}

export async function exportBackup() {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    collections[name] = snap.docs.map(d => ({ id: d.id, data: encode(d.data()) }));
  }
  return { format: 'home-tutor-backup', version: 1, exportedAt: new Date().toISOString(), collections };
}

export function describeFile(obj) {
  if (!obj || typeof obj !== 'object' || !obj.collections) return null;
  const counts = Object.entries(obj.collections).map(([k, v]) => `${k}: ${v.length}`).join(', ');
  const kind = obj.format === 'legacy-export' ? 'Old system export'
    : obj.format === 'home-tutor-backup' ? 'Backup of this system' : null;
  return kind ? { kind, counts } : null;
}

export async function importFile(obj, log = () => {}) {
  if (obj?.format === 'home-tutor-backup') return restoreBackup(obj, log);
  if (obj?.format === 'legacy-export') return importLegacy(obj, log);
  throw new Error('This file is not a recognised export or backup.');
}

async function restoreBackup(obj, log) {
  const ops = [];
  for (const [name, docs] of Object.entries(obj.collections || {})) {
    if (!BACKUP_COLLECTIONS.includes(name)) { log(`Skipped unknown collection "${name}"`); continue; }
    for (const { id, data } of docs) ops.push({ type: 'set', ref: doc(db, name, id), data: decode(data) });
    log(`${name}: ${docs.length} documents`);
  }
  await batchWrite(ops);
  log('Backup restored.');
}

async function existingIds(name) {
  return new Set((await getDocs(collection(db, name))).docs.map(d => d.id));
}

// Safe to run more than once: anything already present is left untouched.
async function importLegacy(obj, log) {
  const c = obj.collections || {};
  const list = n => c[n] || [];
  const ops = [];

  const haveStudents = await existingIds('students');
  const knownStudents = new Set(haveStudents);
  let added = 0, skipped = 0;
  for (const { id, data } of list('students')) {
    knownStudents.add(id);
    if (haveStudents.has(id)) { skipped++; continue; }
    ops.push({ type: 'set', ref: doc(db, 'students', id), data: legacyStudentToNew(id, data, randomToken()) });
    added++;
  }
  log(`Students: ${added} imported, ${skipped} already existed`);

  const haveMat = await existingIds('materials');
  let m = 0;
  for (const { id, data } of list('materials')) {
    const nid = 'legacy_' + id;
    if (haveMat.has(nid) || !knownStudents.has(data.studentUsername)) continue;
    ops.push({ type: 'set', ref: doc(db, 'materials', nid), data: legacyMaterialToNew(data) });
    m++;
  }
  log(`Materials: ${m} imported`);

  const haveSub = await existingIds('legacySubmissions');
  let s = 0;
  for (const { id, data } of list('submissions')) {
    if (haveSub.has(id) || !knownStudents.has(data.username)) continue;
    ops.push({ type: 'set', ref: doc(db, 'legacySubmissions', id), data: stripUndefined({ ...data, studentId: data.username }) });
    s++;
  }
  log(`Old exam results: ${s} imported (shown on each student's Results tab)`);

  const haveQ = await existingIds('nanoQuestions');
  let q = 0, qSkipped = 0;
  for (const { id, data } of list('gamifiedExams')) {
    (data.questions || []).forEach((question, i) => {
      const nid = `legacy_${id}_${i}`;
      if (haveQ.has(nid)) return;
      const conv = convertGamifiedQuestion(data, id, question);
      if (!conv) { qSkipped++; return; }
      conv.createdAt = new Date().toISOString();
      ops.push({ type: 'set', ref: doc(db, 'nanoQuestions', nid), data: conv });
      q++;
    });
  }
  log(`Nano questions: ${q} imported into the library${qSkipped ? `, ${qSkipped} skipped (empty)` : ''}`);

  const app = list('settings').find(x => x.id === 'app');
  if (app?.data?.creditGoal) {
    ops.push({ type: 'set', merge: true, ref: doc(db, 'public', 'teacher'), data: { creditGoal: Number(app.data.creditGoal) || 5000 } });
    log('Credit goal imported');
  }
  const lists = {
    classes: list('classes').map(x => x.data.className).filter(Boolean),
    subjects: list('subjects').map(x => x.data.subjectName).filter(Boolean)
  };
  if (lists.classes.length || lists.subjects.length) {
    ops.push({ type: 'set', ref: doc(db, 'config', 'legacyLists'), data: lists });
    log('Old class & subject lists saved (used when we build the Nano Library routes)');
  }

  log(`Writing ${ops.length} documents…`);
  await batchWrite(ops);
  log('Import finished.');
}
