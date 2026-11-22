// Offline exams: create, enter marks per student, publish to dashboards, WhatsApp result.
import { db, doc, setDoc, deleteDoc, collection, getDocs } from '../firebase.js';
import { store, studentLink, templateText, addSubject } from '../store.js';
import { openModal, confirmDialog, toast, sendWhatsApp } from '../ui.js';
import { esc, fmtYMD, todayYMD } from '../utils.js';
import { CLASSES, classLabel } from '../nano.js';
import { notify } from '../push.js';
import { syncOfflineExam, removeOfflineExam, offlineResultDoc, hasMarks } from '../examsync.js';

export async function mount(el) {
  let exams = (await getDocs(collection(db, 'offlineExams'))).docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  const draw = () => {
    el.innerHTML = `<div class="row between"><h2>Offline exams</h2><button class="btn btn-primary" id="new"><i class="fas fa-plus"></i> New exam</button></div>
      <div class="stack stagger">${exams.length ? exams.map(x => {
        const done = (x.studentIds || []).filter(id => hasMarks(x, (x.marks || {})[id])).length;
        return `<div class="card"><div class="row between"><div><div class="title">${esc(x.title)}</div>
          <div class="muted">${esc(classLabel(x.class))} · ${esc(x.subject)} · ${x.date ? fmtYMD(x.date) : ''}</div>
          <div class="muted">${[x.hasMcq ? `MCQ ${x.mcqFull}` : '', x.hasWritten ? `Written ${x.writtenFull}` : ''].filter(Boolean).join(' + ')}</div></div>
          <span class="chip ${done === (x.studentIds || []).length && done ? 'ok' : 'warn'}">${done}/${(x.studentIds || []).length} marked</span></div>
          <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-a="marks" data-id="${esc(x.id)}"><i class="fas fa-pen-to-square"></i> Enter marks</button>
            <button class="btn btn-sm" data-a="edit" data-id="${esc(x.id)}"><i class="fas fa-gear"></i></button>
            <button class="btn btn-sm" data-a="del" data-id="${esc(x.id)}"><i class="fas fa-trash"></i></button></div></div>`; }).join('')
        : '<div class="card empty"><div class="orb"><i class="fas fa-file-pen"></i></div>No offline exams yet.</div>'}</div>`;
  };
  draw();
  el.addEventListener('click', async e => {
    if (e.target.closest('#new')) return create();
    const b = e.target.closest('[data-a]'); if (!b) return;
    const x = exams.find(v => v.id === b.dataset.id); if (!x) return;
    if (b.dataset.a === 'marks') return marks(x);
    if (b.dataset.a === 'edit') return create(x);
    if (!await confirmDialog(`Delete "${x.title}" and its results from students' dashboards?`, { danger: true, okLabel: 'Delete' })) return;
    await removeOfflineExam(x, store.students); await deleteDoc(doc(db, 'offlineExams', x.id));
    exams = exams.filter(v => v.id !== x.id); draw(); toast('Deleted');
  });

  function create(x) {
    const ctx = openModal({
      title: x ? 'Exam settings' : 'New offline exam', wide: true,
      body: `<label style="margin-top:0">Title</label><input id="o-title" value="${esc(x?.title || '')}">
        <div class="two"><div><label>Class</label><select id="o-class">${CLASSES.map(c => `<option value="${c[0]}" ${x?.class === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select></div>
        <div><label>Subject</label><input id="o-sub" list="o-dl" value="${esc(x?.subject || '')}"><datalist id="o-dl">${store.subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div></div>
        <label>Date</label><input id="o-date" type="date" value="${esc(x?.date || todayYMD())}">
        <div class="two"><div><label class="check"><input type="checkbox" id="o-hm" ${x ? (x.hasMcq ? 'checked' : '') : 'checked'}> MCQ</label><input id="o-mf" type="number" min="1" placeholder="MCQ full mark" value="${x?.mcqFull || ''}"></div>
        <div><label class="check"><input type="checkbox" id="o-hw" ${x ? (x.hasWritten ? 'checked' : '') : 'checked'}> Written</label><input id="o-wf" type="number" min="1" placeholder="Written full mark" value="${x?.writtenFull || ''}"></div></div>
        <label>Assign to</label><div class="checks">${store.students.map(s => `<label class="check"><input type="checkbox" class="o-stu" value="${esc(s.id)}" ${(x?.studentIds || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)} <span class="muted">${esc(s.className)}</span></label>`).join('')}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async c => {
        const q = id => c.el.querySelector(id);
        const title = q('#o-title').value.trim(), subject = q('#o-sub').value.trim();
        const hasMcq = q('#o-hm').checked, hasWritten = q('#o-hw').checked;
        const mcqFull = hasMcq ? parseFloat(q('#o-mf').value) : 0, writtenFull = hasWritten ? parseFloat(q('#o-wf').value) : 0;
        if (!title || !subject) throw new Error('Title and subject are required');
        if (!hasMcq && !hasWritten) throw new Error('Choose MCQ, Written or both');
        if ((hasMcq && !(mcqFull > 0)) || (hasWritten && !(writtenFull > 0))) throw new Error('Enter the full marks');
        const ids = [...c.el.querySelectorAll('.o-stu:checked')].map(i => i.value);
        if (!ids.length) throw new Error('Assign at least one student');
        const id = x?.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        const rec = { title, subject, class: q('#o-class').value, date: q('#o-date').value, hasMcq, hasWritten, mcqFull, writtenFull, studentIds: ids,
          marks: x?.marks || {}, createdAt: x?.createdAt || new Date().toISOString() };
        await setDoc(doc(db, 'offlineExams', id), rec); await addSubject(subject);
        await syncOfflineExam({ id, ...rec }, store.students, x?.studentIds || []);
        const i = exams.findIndex(v => v.id === id); if (i >= 0) exams[i] = { id, ...rec }; else exams.unshift({ id, ...rec });
        draw(); toast('Saved');
      } }]
    });
  }

  function marks(x) {
    const ss = (x.studentIds || []).map(id => store.students.find(s => s.id === id)).filter(Boolean);
    const full = (x.hasMcq ? x.mcqFull : 0) + (x.hasWritten ? x.writtenFull : 0);
    const m = x.marks || {};
    const ctx = openModal({
      title: x.title, wide: true,
      body: `<p class="muted">Full marks: ${[x.hasMcq ? `MCQ ${x.mcqFull}` : '', x.hasWritten ? `Written ${x.writtenFull}` : ''].filter(Boolean).join(' · ')} · Total ${full}</p>
        ${ss.map(s => `<div class="list-item" data-s="${esc(s.id)}" style="flex-wrap:wrap"><div class="grow"><div class="title">${esc(s.name)}</div><div class="muted tot"></div></div>
          ${x.hasMcq ? `<input class="mk" data-k="mcq" type="number" min="0" max="${x.mcqFull}" step="any" placeholder="MCQ" style="width:90px" value="${m[s.id]?.mcq ?? ''}">` : ''}
          ${x.hasWritten ? `<input class="mk" data-k="written" type="number" min="0" max="${x.writtenFull}" step="any" placeholder="Written" style="width:100px" value="${m[s.id]?.written ?? ''}">` : ''}
          <button class="btn btn-sm btn-wa wa" ${s.guardianNumber ? '' : 'disabled'} title="Send result"><i class="fab fa-whatsapp"></i></button></div>`).join('')}`,
      actions: [{ label: 'Close' }, { label: 'Save & publish to students', cls: 'btn-primary', onClick: async c => { await save(c); return false; } }]
    });
    const read = () => { const out = {}; ctx.el.querySelectorAll('[data-s]').forEach(r => {
      const o = {}; r.querySelectorAll('.mk').forEach(i => { o[i.dataset.k] = i.value === '' ? '' : Number(i.value); }); out[r.dataset.s] = o; }); return out; };
    const refresh = () => ctx.el.querySelectorAll('[data-s]').forEach(r => {
      const mk = read()[r.dataset.s];
      r.querySelector('.tot').textContent = hasMarks(x, mk) ? `Total ${offlineResultDoc(x, mk).total} / ${full}` : 'Not marked';
    });
    refresh();
    ctx.el.addEventListener('input', refresh);
    const save = async c => {
      const all = read();
      for (const [id, o] of Object.entries(all)) {
        if (x.hasMcq && o.mcq !== '' && (o.mcq < 0 || o.mcq > x.mcqFull)) throw new Error(`MCQ mark must be 0–${x.mcqFull}`);
        if (x.hasWritten && o.written !== '' && (o.written < 0 || o.written > x.writtenFull)) throw new Error(`Written mark must be 0–${x.writtenFull}`);
      }
      const before = x.marks || {};
      x.marks = all;
      await setDoc(doc(db, 'offlineExams', x.id), (({ id, ...r }) => r)(x));
      await syncOfflineExam(x, store.students, x.studentIds); draw(); toast('Saved & published to dashboards');
      const changed = x.studentIds.filter(id => hasMarks(x, all[id]) && JSON.stringify(all[id]) !== JSON.stringify(before[id]));
      if (changed.length) notify(changed, { title: '📊 Result published', body: `${x.title} (${x.subject})`, tab: 'results', tag: 'result' }, { quiet: true });
    };
    ctx.el.addEventListener('click', async ev => {
      const w = ev.target.closest('.wa'); if (!w) return;
      const row = w.closest('[data-s]'), s = ss.find(v => v.id === row.dataset.s), mk = read()[s.id];
      if (!hasMarks(x, mk)) return toast('Enter marks first', 'err');
      const r = offlineResultDoc(x, mk);
      sendWhatsApp(s.guardianNumber, templateText('offlineResult', {
        student: s.name, title: x.title, subject: x.subject,
        mcq: x.hasMcq ? `MCQ: ${r.mcq} / ${x.mcqFull}\n` : '', written: x.hasWritten ? `Written: ${r.written} / ${x.writtenFull}\n` : '',
        total: r.total, full: r.full, percent: r.pct, link: studentLink(s.token)
      }));
    });
  }
}
