// Teacher: build Nano exams from the library, assign to students, send links, see attempts.
import { db, doc, setDoc, deleteDoc, collection, getDocs } from '../firebase.js';
import { store, studentLink, templateText } from '../store.js';
import { openModal, confirmDialog, toast, copyText, sendWhatsApp } from '../ui.js';
import { esc } from '../utils.js';
import { richHtml } from '../math.js';
import { CLASSES, classLabel, TYPES } from '../nano.js';
import { syncNanoExam, removeNanoExam, readAttempts } from '../examsync.js';
import { notify } from '../push.js';

const examLink = (token, id) => new URL(`exam.html?t=${token}&e=${id}`, location.href).href;

export async function mountExams(el, nano) {
  let exams = (await getDocs(collection(db, 'nanoExams'))).docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const draw = () => {
    el.innerHTML = `<div class="row between"><h3>Nano exams</h3><button class="btn btn-primary" id="new"><i class="fas fa-plus"></i> New exam</button></div>
      <div class="stack stagger">${exams.length ? exams.map(x => `<div class="card">
        <div class="row between"><div><div class="title">${esc(x.title)}</div>
          <div class="muted">${(x.questionIds || []).length} questions · ${x.totalMinutes} min · ${x.points} credit${x.points === 1 ? '' : 's'} each${x.penalty ? ` · −${x.penalty} wrong` : ''}</div></div>
          <span class="chip">${(x.studentIds || []).length} student${(x.studentIds || []).length === 1 ? '' : 's'}</span></div>
        <div class="row" style="margin-top:10px"><button class="btn btn-sm" data-a="links" data-id="${esc(x.id)}"><i class="fab fa-whatsapp"></i> Send links</button>
          <button class="btn btn-sm" data-a="res" data-id="${esc(x.id)}"><i class="fas fa-chart-simple"></i> Attempts</button>
          <button class="btn btn-sm" data-a="edit" data-id="${esc(x.id)}"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn btn-sm" data-a="del" data-id="${esc(x.id)}"><i class="fas fa-trash"></i></button></div></div>`).join('')
        : '<div class="card empty"><div class="orb"><i class="fas fa-bolt"></i></div>No exams yet. Pick questions from your library and launch one.</div>'}</div>`;
  };
  draw();
  el.addEventListener('click', async e => {
    if (e.target.closest('#new')) return builder();
    const b = e.target.closest('[data-a]'); if (!b) return;
    const x = exams.find(v => v.id === b.dataset.id); if (!x) return;
    if (b.dataset.a === 'edit') return builder(x);
    if (b.dataset.a === 'links') return sendLinks(x);
    if (b.dataset.a === 'res') return results(x);
    if (!await confirmDialog(`Delete "${x.title}"? Students lose access; their earned credits stay.`, { danger: true, okLabel: 'Delete' })) return;
    await removeNanoExam(x, store.students); await deleteDoc(doc(db, 'nanoExams', x.id));
    exams = exams.filter(v => v.id !== x.id); draw(); toast('Deleted');
  });

  function sendLinks(x) {
    const ss = (x.studentIds || []).map(id => store.students.find(s => s.id === id)).filter(Boolean);
    openModal({
      title: 'Send exam links',
      body: `<p class="muted">Each student has their own exam link. Buttons open the guardian's WhatsApp.</p>
        ${ss.map(s => `<div class="list-item"><div class="grow"><div class="title">${esc(s.name)}</div></div>
          <button class="btn btn-sm" data-c="${esc(s.id)}"><i class="fas fa-copy"></i></button>
          <button class="btn btn-sm btn-wa" data-s="${esc(s.id)}" ${s.guardianNumber ? '' : 'disabled'}><i class="fab fa-whatsapp"></i></button></div>`).join('') || '<div class="empty">Nobody assigned.</div>'}`,
      actions: [{ label: 'Done' }]
    }).el.addEventListener('click', async ev => {
      const c = ev.target.closest('[data-c]'), w = ev.target.closest('[data-s]');
      if (c) { const s = ss.find(v => v.id === c.dataset.c); await copyText(examLink(s.token, x.id)); toast('Exam link copied'); }
      if (w) {
        const s = ss.find(v => v.id === w.dataset.s);
        sendWhatsApp(s.guardianNumber, templateText('nanoExam', { student: s.name, title: x.title, questions: (x.questionIds || []).length, minutes: x.totalMinutes, points: x.points, examLink: examLink(s.token, x.id), link: studentLink(s.token) }));
      }
    });
  }

  async function results(x) {
    const ss = (x.studentIds || []).map(id => store.students.find(s => s.id === id)).filter(Boolean);
    const rows = await Promise.all(ss.map(async s => ({ s, a: (await readAttempts(s.token)).find(v => v.id === x.id) })));
    openModal({
      title: x.title, wide: true,
      body: rows.map(({ s, a }) => `<div class="list-item"><div class="grow"><div class="title">${esc(s.name)}</div>
        <div class="muted">${a ? `${a.correct}/${a.total} correct · ${a.wrong} wrong` : 'Not attempted yet'}</div></div>
        ${a ? `<span class="chip ok">+${a.creditsEarned} ⭐</span>` : '<span class="chip warn">Pending</span>'}</div>`).join('') || '<div class="empty">Nobody assigned.</div>',
      actions: [{ label: 'Close' }]
    });
  }

  function builder(x) {
    const sel = new Set(x?.questionIds || []);
    let f = { class: '', subject: '', chapter: '', q: '' };
    const pool = () => nano.questions.filter(q => q.status === 'published' && (!f.class || q.class === f.class) && (!f.subject || q.subject === f.subject)
      && (!f.chapter || q.chapter === f.chapter) && (!f.q || q.q.toLowerCase().includes(f.q)));
    const ctx = openModal({
      title: x ? 'Edit exam' : 'New Nano exam', wide: true,
      body: `<label style="margin-top:0">Title</label><input id="e-title" value="${esc(x?.title || '')}" placeholder="e.g. Motion – quick test">
        <div class="two"><div><label>Total time (minutes)</label><input id="e-min" type="number" min="1" value="${x?.totalMinutes || 15}"></div>
        <div><label>Credits per correct answer</label><input id="e-pts" type="number" min="1" step="1" value="${x?.points || 5}"></div></div>
        <label>Credits lost per wrong answer (0 = none)</label><input id="e-pen" type="number" min="0" step="1" value="${x?.penalty || 0}">
        <label>Assign to</label><div class="checks">${store.students.map(s => `<label class="check"><input type="checkbox" class="e-stu" value="${esc(s.id)}" ${(x?.studentIds || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)} <span class="muted">${esc(s.className)}</span></label>`).join('') || '<span class="muted">No students</span>'}</div>
        <label>Questions · <b id="e-count">${sel.size}</b> selected</label>
        <div class="two"><select id="f-class"><option value="">All classes</option>${CLASSES.map(c => `<option value="${c[0]}">${esc(c[1])}</option>`).join('')}</select>
        <select id="f-sub"><option value="">All subjects</option>${[...new Set(nano.questions.map(q => q.subject))].sort().map(s => `<option>${esc(s)}</option>`).join('')}</select>
        <select id="f-ch"><option value="">All chapters</option></select><input id="f-q" placeholder="Search…"></div>
        <div id="pool" class="checks" style="max-height:300px;margin-top:10px"></div>`,
      actions: [{ label: 'Cancel' }, { label: x ? 'Save & update students' : 'Launch exam', cls: 'btn-primary', onClick: async c => {
        const q = id => c.el.querySelector(id).value;
        const title = q('#e-title').trim(); if (!title) throw new Error('Give the exam a title');
        const points = parseInt(q('#e-pts'), 10), minutes = parseInt(q('#e-min'), 10), penalty = parseInt(q('#e-pen'), 10) || 0;
        if (!(points >= 1)) throw new Error('Credits per correct answer must be 1 or more');
        if (!(minutes >= 1)) throw new Error('Set the total time');
        if (!sel.size) throw new Error('Select at least one question');
        if (sel.size > 100) throw new Error('Maximum 100 questions per exam');
        const ids = [...c.el.querySelectorAll('.e-stu:checked')].map(i => i.value);
        if (!ids.length) throw new Error('Assign at least one student');
        const rec = { title, totalMinutes: minutes, points, penalty, questionIds: [...sel], studentIds: ids, createdAt: x?.createdAt || new Date().toISOString() };
        const id = x?.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        await setDoc(doc(db, 'nanoExams', id), rec);
        await syncNanoExam({ id, ...rec }, nano.questions, store.students, x?.studentIds || []);
        const i = exams.findIndex(v => v.id === id); if (i >= 0) exams[i] = { id, ...rec }; else exams.unshift({ id, ...rec });
        draw(); toast('Exam is live on the students\' dashboards');
        const fresh = ids.filter(i => !(x?.studentIds || []).includes(i));
        if (fresh.length) notify(fresh, { title: '⚡ Nano exam added', body: `${title} · ${sel.size} questions · ${minutes} min`, tab: 'nano', tag: 'nano' });
        if (!x && await confirmDialog('Send the exam links on WhatsApp now?', { okLabel: 'Yes' })) sendLinks({ id, ...rec });
      } }]
    });
    const $ = id => ctx.el.querySelector(id);
    const drawPool = () => {
      const list = pool().slice(0, 150);
      $('#pool').innerHTML = list.map(q => `<label class="check" style="align-items:flex-start"><input type="checkbox" class="pq" value="${esc(q.id)}" ${sel.has(q.id) ? 'checked' : ''}>
        <span class="${q.version}" style="font-size:.9rem">${richHtml(q.q).slice(0, 220)}<br><span class="muted">${esc(classLabel(q.class))} · ${esc(q.subject)} › ${esc(q.chapter)} · ${TYPES[q.type]}</span></span></label>`).join('')
        || '<div class="muted" style="padding:10px">No published questions match.</div>';
    };
    drawPool();
    ctx.el.addEventListener('change', e => {
      if (e.target.classList.contains('pq')) { e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); $('#e-count').textContent = sel.size; return; }
      if (e.target.id === 'f-class') f.class = e.target.value;
      if (e.target.id === 'f-sub') { f.subject = e.target.value; f.chapter = ''; $('#f-ch').innerHTML = '<option value="">All chapters</option>' + [...new Set(nano.questions.filter(q => q.subject === f.subject).map(q => q.chapter))].sort().map(s => `<option>${esc(s)}</option>`).join(''); }
      if (e.target.id === 'f-ch') f.chapter = e.target.value;
      drawPool();
    });
    ctx.el.addEventListener('input', e => { if (e.target.id === 'f-q') { f.q = e.target.value.trim().toLowerCase(); drawPool(); } });
  }
}
