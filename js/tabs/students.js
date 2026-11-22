import { db, doc, setDoc, deleteDoc } from '../firebase.js';
import { store, loadStudents, studentLink, templateText } from '../store.js';
import { openModal, confirmDialog, copyText, toast, sendWhatsApp } from '../ui.js';
import { esc, initials, randomToken, sanitizePhone, maskPhone, emptyAttendance } from '../utils.js';
import { syncStudentView, deleteStudentView } from '../viewsync.js';

export async function mount(el) {
  const draw = () => {
    el.innerHTML = `
      <div class="row between"><h2>Students</h2><button class="btn btn-primary" id="add"><i class="fas fa-plus"></i> Add student</button></div>
      <div class="card stagger">${store.students.length ? store.students.map(s => `
        <div class="list-item">
          <div class="avatar">${esc(initials(s.name))}</div>
          <div class="grow"><div class="title">${esc(s.name)}</div>
            <div class="muted">${esc(s.className)}${s.school ? ' · ' + esc(s.school) : ''} · ${esc(maskPhone(s.guardianNumber))}</div></div>
          <div class="row">
            <button class="btn btn-sm" data-a="link" data-id="${esc(s.id)}"><i class="fas fa-link"></i> Link</button>
            <button class="btn btn-sm btn-wa" data-a="wa" data-id="${esc(s.id)}"><i class="fab fa-whatsapp"></i></button>
            <button class="btn btn-sm" data-a="edit" data-id="${esc(s.id)}"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm" data-a="del" data-id="${esc(s.id)}"><i class="fas fa-trash"></i></button>
          </div></div>`).join('') : '<div class="empty"><div class="orb"><i class="fas fa-user-plus"></i></div>No students yet. Add your first one.</div>'}</div>`;
  };
  draw();

  el.addEventListener('click', async e => {
    if (e.target.closest('#add')) return form();
    const b = e.target.closest('[data-a]'); if (!b) return;
    const s = store.students.find(x => x.id === b.dataset.id); if (!s) return;
    if (b.dataset.a === 'edit') return form(s);
    if (b.dataset.a === 'link') { await copyText(studentLink(s.token)); return toast('Student link copied'); }
    if (b.dataset.a === 'wa') {
      if (!s.guardianNumber) return toast('No guardian number saved', 'err');
      return sendWhatsApp(s.guardianNumber, templateText('welcome', { student: s.name, class: s.className, link: studentLink(s.token) }));
    }
    if (b.dataset.a === 'del') {
      if (!await confirmDialog(`Delete ${s.name} and their student page? Attendance records go too. This cannot be undone.`, { danger: true, okLabel: 'Delete' })) return;
      await deleteStudentView(s.token);
      await deleteDoc(doc(db, 'students', s.id));
      await loadStudents(); draw(); toast('Deleted');
    }
  });

  function form(s) {
    const isNew = !s;
    const m = openModal({
      title: isNew ? 'Add student' : 'Edit student',
      body: `
        <label>Name</label><input id="f-name" value="${esc(s?.name || '')}">
        <label>Class</label><input id="f-class" value="${esc(s?.className || '')}" placeholder="e.g. Class 9, HSC 1st year">
        <label>School / college (optional)</label><input id="f-school" value="${esc(s?.school || '')}">
        <label>Guardian WhatsApp number</label><input id="f-g" value="${esc(s?.guardianNumber || '')}" placeholder="01XXXXXXXXX" inputmode="tel">
        <label>Student WhatsApp (optional)</label><input id="f-w" value="${esc(s?.waStudent || '')}" inputmode="tel">`,
      actions: [{ label: 'Cancel' }, {
        label: 'Save', cls: 'btn-primary', onClick: async ctx => {
          const q = id => ctx.el.querySelector(id).value.trim();
          const name = q('#f-name'); if (!name) throw new Error('Name is required');
          const g = q('#f-g') ? sanitizePhone(q('#f-g')) : '';
          const w = q('#f-w') ? sanitizePhone(q('#f-w')) : '';
          if (q('#f-g') && !g) throw new Error('Guardian number looks invalid');
          if (q('#f-w') && !w) throw new Error('Student number looks invalid');
          const now = new Date().toISOString();
          const rec = {
            ...(s || { token: randomToken(), attendance: emptyAttendance(), creditsBase: 0, createdAt: now }),
            name, className: q('#f-class'), school: q('#f-school'), guardianNumber: g, waStudent: w, updatedAt: now
          };
          const id = s?.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
          delete rec.id;
          await setDoc(doc(db, 'students', id), rec);
          await syncStudentView({ ...rec, id });
          await loadStudents(); draw(); toast('Saved');
        }
      }]
    });
  }
}
