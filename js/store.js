// In-memory copy of the teacher's data (tiny: a handful of students).
import { db, collection, getDocs, doc, getDoc } from './firebase.js';
import { DEFAULT_TEMPLATES } from './templates.js';
import { fillTemplate } from './utils.js';

export const store = {
  user: null,
  students: [],
  materials: [],
  teacher: { name: '', bio: '', creditGoal: 5000 },
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
  store.teacher = { name: '', bio: '', creditGoal: 5000, ...(d.exists() ? d.data() : {}) };
}
export async function loadTemplates() {
  const d = await getDoc(doc(db, 'config', 'templates'));
  store.templates = d.exists() ? d.data() : {};
}
export async function loadAll() {
  await Promise.all([loadStudents(), loadMaterials(), loadTeacher(), loadTemplates()]);
}

export const studentById = id => store.students.find(s => s.id === id);
export const studentLink = token => new URL(`student.html?t=${token}`, location.href).href;

// Builds a ready-to-send message from the (editable) template.
export function templateText(key, vars = {}) {
  const tpl = store.templates[key] ?? DEFAULT_TEMPLATES[key]?.text ?? '';
  return fillTemplate(tpl, { teacher: store.teacher.name || 'Your teacher', ...vars });
}
