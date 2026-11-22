import { db, doc, setDoc, deleteDoc, collection, getDocs } from '../firebase.js';
import { store, loadStudents, studentLink, templateText } from '../store.js';
import { openModal, confirmDialog, copyText, toast, sendWhatsApp } from '../ui.js';
import { classLabel, CLASSES } from '../nano.js';
import { esc, initials, fmtISODate, randomToken, sanitizePhone, maskPhone, emptyAttendance } from '../utils.js';
import { syncStudentView, deleteStudentView } from '../viewsync.js';
import { notify, pushReady, subsOf } from '../push.js';

export async function mount(el) {
  let reqs = [];
  const loadReqs = async () => {
    reqs = (await getDocs(collection(db, 'joinRequests'))).docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
  };
  await loadReqs().catch(() => {});
  const subCount = {};
  if (pushReady()) await Promise.all(store.students.map(async s => { subCount[s.id] = (await subsOf(s).catch(() => [])).length; }));
  const draw = () => {
    el.innerHTML = `
      <div class="row between"><h2>Students</h2><div class="row"><button class="btn" id="joinlink"><i class="fas fa-link"></i> Join form link</button><button class="btn btn-primary" id="add"><i class="fas fa-plus"></i> Add</button></div></div>
      ${store.teacher.joinOpen ? '' : '<div class="alert alert-warn">Join form is closed. Turn it on in Settings so students can register.</div>'}
      ${reqs.length ? `<div class="card" style="border-color:var(--brand)"><h3>Join requests <span class="chip">${reqs.length}</span></h3>${reqs.map(r => `
        <div class="list-item"><div class="grow"><div class="title">${esc(r.name)}</div>
          <div class="muted">${esc(classLabel(r.className))} · ${esc(r.school)} · ${esc(maskPhone(r.guardianNumber))}${r.submittedAt?.toDate ? ' · ' + fmtISODate(r.submittedAt.toDate().toISOString()) : ''}</div></div>
          <button class="btn btn-sm btn-primary" data-a="approve" data-id="${esc(r.id)}">Review</button>
          <button class="btn btn-sm" data-a="reject" data-id="${esc(r.id)}"><i class="fas fa-xmark"></i></button></div>`).join('')}</div>` : ''}
      <div class="card stagger">${store.students.length ? store.students.map(s => `
        <div class="list-item">
          <div class="avatar">${esc(initials(s.name))}</div>
          <div class="grow"><div class="title">${esc(s.name)}</div>
            <div class="muted">${esc(s.className)}${s.school ? ' · ' + esc(s.school) : ''} · ${esc(maskPhone(s.guardianNumber))}</div>
            ${pushReady() ? `<span class="chip ${subCount[s.id] ? 'ok' : ''}">${subCount[s.id] ? '🔔 notifications on' : '🔕 notifications off'}</span>` : ''}</div>
          <div class="row">
            <button class="btn btn-sm" data-a="link" data-id="${esc(s.id)}"><i class="fas fa-link"></i> Link</button>
            ${pushReady() ? `<button class="btn btn-sm" data-a="bell" data-id="${esc(s.id)}" title="Send notification"><i class="fas fa-bell"></i></button>` : ''}
            <button class="btn btn-sm btn-wa" data-a="wa" data-id="${esc(s.id)}"><i class="fab fa-whatsapp"></i></button>
            <button class="btn btn-sm" data-a="edit" data-id="${esc(s.id)}"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm" data-a="del" data-id="${esc(s.id)}"><i class="fas fa-trash"></i></button>
          </div></div>`).join('') : '<div class="empty"><div class="orb"><i class="fas fa-user-plus"></i></div>No students yet. Add your first one.</div>'}</div>`;
  };
  draw();

  el.addEventListener('click', async e => {
    if (e.target.closest('#add')) return form();
    if (e.target.closest('#joinlink')) { await copyText(new URL('join.html', location.href).href); return toast('Join form link copied. Send it to students.'); }
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'approve' || b.dataset.a === 'reject') {
      const r = reqs.find(x => x.id === b.dataset.id); if (!r) return;
      if (b.dataset.a === 'approve') return form(null, r);
      if (!await confirmDialog(`Reject the request from ${r.name}?`, { danger: true, okLabel: 'Reject' })) return;
      await deleteDoc(doc(db, 'joinRequests', r.id)); await loadReqs(); draw(); return toast('Request removed');
    }
    const s = store.students.find(x => x.id === b.dataset.id); if (!s) return;
    if (b.dataset.a === 'edit') return form(s);
    if (b.dataset.a === 'bell') {
      return openModal({ title: `Notify ${s.name}`, body: '<label style="margin-top:0">Title</label><input id="n-t" maxlength="80" placeholder="e.g. Class tomorrow"><label>Message</label><textarea id="n-b" maxlength="200" style="min-height:80px"></textarea>',
        actions: [{ label: 'Cancel' }, { label: 'Send', cls: 'btn-primary', onClick: async c => {
          const ti = c.el.querySelector('#n-t').value.trim(), bo = c.el.querySelector('#n-b').value.trim();
          if (!ti) throw new Error('Add a title'); await notify([s.id], { title: ti, body: bo, tag: 'note' }); } }] });
    }
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

  function form(s, req) {
    const isNew = !s;
    const src = s || (req ? { name: req.name, className: classLabel(req.className), school: req.school, guardianNumber: req.guardianNumber, waStudent: req.waStudent } : null);
    const m = openModal({
      title: req ? 'Review & approve' : isNew ? 'Add student' : 'Edit student',
      body: `
        <label>Name</label><input id="f-name" value="${esc(src?.name || '')}">
        <label>Class</label><input id="f-class" list="clsl" value="${esc(src?.className || '')}" placeholder="Choose or type"><datalist id="clsl">${CLASSES.map(c => `<option value="${esc(c[1])}">`).join('')}</datalist>
        <label>School / college (optional)</label><input id="f-school" value="${esc(src?.school || '')}">
        <label>Guardian WhatsApp number</label><input id="f-g" value="${esc(src?.guardianNumber || '')}" placeholder="01XXXXXXXXX" inputmode="tel">
        <label>Student WhatsApp (optional)</label><input id="f-w" value="${esc(src?.waStudent || '')}" inputmode="tel">`,
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
          if (req) { await deleteDoc(doc(db, 'joinRequests', req.id)); await loadReqs(); }
          await loadStudents(); draw(); toast(req ? 'Student added. Now send the welcome link.' : 'Saved');
        }
      }]
    });
  }
}
