// In-memory copy of the teacher's data (tiny: a handful of students).
import { db, collection, getDocs, doc, getDoc, setDoc } from './firebase.js';
import { DEFAULT_TEMPLATES } from './templates.js';
import { fillTemplate } from './utils.js';

export const store = {
  user: null,
  students: [],
  materials: [],
  teacher: { name: '', bio: '', creditGoal: 5000, joinOpen: false },
  subjects: [],
  templates: {}
};

export async function listCol(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

export async function loadStudents() {
  store.students = (await listCol('students')).sort(byName);
  return store.students;
}
export async function loadMaterials() {
  store.materials = (await listCol('materials'))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return store.materials;
}
export async function loadTeacher() {
  const d = await getDoc(doc(db, 'public', 'teacher'));
  store.teacher = { name: '', bio: '', creditGoal: 5000, joinOpen: false, ...(d.exists() ? d.data() : {}) };
}
export async function loadTemplates() {
  const d = await getDoc(doc(db, 'config', 'templates'));
  store.templates = d.exists() ? d.data() : {};
}
export async function loadSubjects() {
  const d = await getDoc(doc(db, 'config', 'subjects'));
  store.subjects = d.exists() ? (d.data().list || []) : [];
}
export async function addSubject(name) {
  name = String(name || '').trim();
  if (!name) return;
  if (store.subjects.some(s => s.toLowerCase() === name.toLowerCase())) return;
  store.subjects = [...store.subjects, name].sort((a, b) => a.localeCompare(b));
  await setDoc(doc(db, 'config', 'subjects'), { list: store.subjects });
}
export async function saveSubjects(list) {
  store.subjects = list;
  await setDoc(doc(db, 'config', 'subjects'), { list });
}
export async function loadAll() {
  await Promise.all([loadStudents(), loadMaterials(), loadTeacher(), loadTemplates(), loadSubjects()]);
}

export const studentById = id => store.students.find(s => s.id === id);
export const studentLink = token => new URL(`student.html?t=${token}`, location.href).href;

// Builds a ready-to-send message from the (editable) template.
export function templateText(key, vars = {}) {
  const tpl = store.templates[key] ?? DEFAULT_TEMPLATES[key]?.text ?? '';
  const name = store.teacher.name || 'Your teacher';
  const signature = store.teacher.bio ? `${name} · ${store.teacher.bio}` : name;
  return fillTemplate(tpl, { teacher: name, signature, ...vars });
}
