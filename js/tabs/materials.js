import { db, doc, setDoc, deleteDoc } from '../firebase.js';
import { store, loadMaterials, addSubject, studentLink, templateText } from '../store.js';
import { openModal, confirmDialog, toast, sendWhatsApp } from '../ui.js';
import { esc, isHttpUrl } from '../utils.js';
import { syncMaterialToViews } from '../viewsync.js';
import { notify } from '../push.js';

export const MAT_TYPES = ['Note', 'Video', 'PDF', 'Exam', 'Link', 'Other'];
const ICON = { Note: 'fa-note-sticky', Video: 'fa-circle-play', Link: 'fa-link', PDF: 'fa-file-pdf', Exam: 'fa-pen-to-square', Other: 'fa-shapes' };

export async function mount(el) {
  const names = ids => ids.map(i => store.students.find(s => s.id === i)?.name).filter(Boolean).join(', ') || 'Nobody';
  let fSub = 'All', fType = 'All', q = '';
  const draw = () => {
    const subs = ['All', ...new Set([...store.subjects, ...store.materials.map(m => m.subject).filter(Boolean)])];
    const list = store.materials.filter(m => (fSub === 'All' || m.subject === fSub) && (fType === 'All' || m.type === fType)
      && (!q || `${m.title} ${m.subject} ${m.description || ''}`.toLowerCase().includes(q)));
    el.innerHTML = `
      <div class="row between"><h2>Materials</h2><button class="btn btn-primary" id="add"><i class="fas fa-plus"></i> Add material</button></div>
      ${store.materials.length ? `<input id="q" placeholder="Search materials…" value="${esc(q)}">
      <div class="chips" data-f="sub">${subs.map(x => `<button class="chip ${x === fSub ? 'active' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="chips" data-f="type">${['All', ...MAT_TYPES].map(x => `<button class="chip ${x === fType ? 'active' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      <div class="card stagger">${list.length ? list.map(m => `
        <div class="list-item"><div class="type-ico t-${esc(m.type)}"><i class="fas ${ICON[m.type] || 'fa-file'}"></i></div><div class="grow"><div class="title">${esc(m.title)}</div>
          <div class="muted"><span class="chip">${esc(m.subject || '—')}</span> ${esc(m.type)} · for ${esc(names(m.studentIds || []))}</div>
          ${m.description ? `<div class="muted" style="margin-top:2px">${esc(m.description)}</div>` : ''}</div>
          <button class="btn btn-sm btn-wa" data-a="wa" data-id="${esc(m.id)}" title="Send on WhatsApp"><i class="fab fa-whatsapp"></i></button>
          <button class="btn btn-sm" data-a="edit" data-id="${esc(m.id)}"><i class="fas fa-pen"></i></button>
          <button class="btn btn-sm" data-a="del" data-id="${esc(m.id)}"><i class="fas fa-trash"></i></button></div>`).join('')
        : `<div class="empty"><div class="orb"><i class="fas fa-book-open"></i></div>${store.materials.length ? 'Nothing matches.' : 'No materials yet.'}</div>`}</div>`;
    const qi = el.querySelector('#q');
    if (qi && document.activeElement === document.body && q) { qi.focus(); qi.setSelectionRange(q.length, q.length); }
  };
  draw();

  el.addEventListener('input', e => { if (e.target.id === 'q') { q = e.target.value.trim().toLowerCase(); draw(); const i = el.querySelector('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
  el.addEventListener('click', async e => {
    if (e.target.closest('#add')) return form();
    const chip = e.target.closest('.chips .chip');
    if (chip) { const f = chip.parentElement.dataset.f; if (f === 'sub') fSub = chip.dataset.v; else fType = chip.dataset.v; return draw(); }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const m = store.materials.find(x => x.id === b.dataset.id); if (!m) return;
    if (b.dataset.a === 'edit') return form(m);
    if (b.dataset.a === 'wa') return sendDialog(m);
    if (!await confirmDialog(`Delete "${m.title}"?`, { danger: true, okLabel: 'Delete' })) return;
    await syncMaterialToViews({ ...m, studentIds: [] }, store.students, m.studentIds || []);
    await deleteDoc(doc(db, 'materials', m.id));
    await loadMaterials(); draw(); toast('Deleted');
  });

  // One WhatsApp button per assigned student (each goes to that student's guardian).
  function sendDialog(m) {
    const ids = (m.studentIds || []).map(id => store.students.find(s => s.id === id)).filter(Boolean);
    if (!ids.length) return toast('This material is not assigned to anyone', 'err');
    openModal({
      title: 'Send on WhatsApp',
      body: `<p class="muted">Each button opens that student's guardian chat with the message ready (also copied).</p>
        ${ids.map(s => `<div class="list-item"><div class="grow"><div class="title">${esc(s.name)}</div><div class="muted">${s.guardianNumber ? '' : 'No guardian number'}</div></div>
        <button class="btn btn-sm btn-wa" data-s="${esc(s.id)}" ${s.guardianNumber ? '' : 'disabled'}><i class="fab fa-whatsapp"></i> Send</button></div>`).join('')}`,
      actions: [{ label: 'Done' }]
    }).el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-s]'); if (!b) return;
      const s = ids.find(x => x.id === b.dataset.s);
      sendWhatsApp(s.guardianNumber, templateText('material', {
        student: s.name, title: m.title, subject: m.subject, type: m.type,
        description: m.description ? m.description + '\n' : '', link: studentLink(s.token)
      }));
    });
  }

  function form(m) {
    const ctx = openModal({
      title: m ? 'Edit material' : 'Add material',
      wide: true,
      body: `
        <label>Title</label><input id="m-title" value="${esc(m?.title || '')}">
        <div class="two"><div><label>Type</label><select id="m-type">${MAT_TYPES.map(t => `<option ${m?.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label>Subject <span style="color:var(--err)">*</span></label><select id="m-sub"></select></div></div>
        <div class="row" style="margin-top:8px"><input id="m-newsub" placeholder="New subject, e.g. Physics" style="flex:1"><button class="btn btn-sm" id="m-addsub" type="button"><i class="fas fa-plus"></i> Add subject</button></div>
        <label>Description (optional)</label><textarea id="m-desc" style="min-height:70px" placeholder="What is this about?">${esc(m?.description || '')}</textarea>
        <label>Link (Drive, YouTube, etc.)</label><input id="m-link" value="${esc(m?.link || '')}" placeholder="https://…">
        <label>Share with</label>
        <div class="checks">${store.students.map(s => `<label class="check"><input type="checkbox" value="${esc(s.id)}" ${(m?.studentIds || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)} <span class="muted">${esc(s.className)}</span></label>`).join('') || '<span class="muted">No students</span>'}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async c => {
        const q = id => c.el.querySelector(id).value.trim();
        const title = q('#m-title'), link = q('#m-link'), subject = q('#m-sub');
        if (!title) throw new Error('Title is required');
        if (!subject) throw new Error('Choose a subject (or add one first)');
        if (!isHttpUrl(link)) throw new Error('Link must start with http:// or https://');
        const ids = [...c.el.querySelectorAll('.checks input:checked')].map(i => i.value);
        const id = m?.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        const rec = { title, type: q('#m-type'), subject, description: q('#m-desc'), link, studentIds: ids, createdAt: m?.createdAt || new Date().toISOString() };
        await setDoc(doc(db, 'materials', id), rec);
        await syncMaterialToViews({ id, ...rec }, store.students, m?.studentIds || []);
        await loadMaterials(); draw(); toast('Saved');
        const fresh = ids.filter(i => !(m?.studentIds || []).includes(i));
        if (fresh.length) notify(fresh, { title: `New ${rec.type}: ${title}`, body: `${subject}${rec.description ? ' · ' + rec.description : ''}`, tab: 'materials', tag: 'material' }, { quiet: true });
        if (ids.length && await confirmDialog('Send this on WhatsApp to the guardians now?', { okLabel: 'Yes, send' })) sendDialog({ id, ...rec });
      } }]
    });
    const sel = ctx.el.querySelector('#m-sub');
    const fillSubs = pick => {
      sel.innerHTML = (store.subjects.length ? '' : '<option value="">No subjects yet. Add one below</option>') +
        store.subjects.map(s => `<option ${s === pick ? 'selected' : ''}>${esc(s)}</option>`).join('');
    };
    fillSubs(m?.subject);
    if (m?.subject && !store.subjects.includes(m.subject)) { store.subjects.push(m.subject); fillSubs(m.subject); }
    ctx.el.querySelector('#m-addsub').onclick = async () => {
      const inp = ctx.el.querySelector('#m-newsub'), name = inp.value.trim(); if (!name) return;
      await addSubject(name); fillSubs(name); inp.value = ''; toast('Subject added');
    };
  }
}
