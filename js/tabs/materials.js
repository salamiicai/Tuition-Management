import { db, doc, setDoc, deleteDoc } from '../firebase.js';
import { store, loadMaterials } from '../store.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { esc, isHttpUrl } from '../utils.js';
import { syncMaterialToViews } from '../viewsync.js';

const TYPES = ['Note', 'Video', 'Link', 'PDF', 'Other'];
const ICON = { Note: 'fa-note-sticky', Video: 'fa-circle-play', Link: 'fa-link', PDF: 'fa-file-pdf', Other: 'fa-shapes' };

export async function mount(el) {
  const names = ids => ids.map(i => store.students.find(s => s.id === i)?.name).filter(Boolean).join(', ') || 'Nobody';
  const draw = () => {
    el.innerHTML = `
      <div class="row between"><h2>Materials</h2><button class="btn btn-primary" id="add"><i class="fas fa-plus"></i> Add material</button></div>
      <div class="card stagger">${store.materials.length ? store.materials.map(m => `
        <div class="list-item"><div class="type-ico t-${esc(m.type)}"><i class="fas ${ICON[m.type] || 'fa-file'}"></i></div><div class="grow"><div class="title">${esc(m.title)}</div>
          <div class="muted"><span class="chip">${esc(m.type)}</span> ${esc(m.subject || '')} · for ${esc(names(m.studentIds || []))}</div></div>
          <button class="btn btn-sm" data-a="edit" data-id="${esc(m.id)}"><i class="fas fa-pen"></i></button>
          <button class="btn btn-sm" data-a="del" data-id="${esc(m.id)}"><i class="fas fa-trash"></i></button></div>`).join('')
        : '<div class="empty"><div class="orb"><i class="fas fa-book-open"></i></div>No materials yet.</div>'}</div>`;
  };
  draw();
  el.addEventListener('click', async e => {
    if (e.target.closest('#add')) return form();
    const b = e.target.closest('[data-a]'); if (!b) return;
    const m = store.materials.find(x => x.id === b.dataset.id); if (!m) return;
    if (b.dataset.a === 'edit') return form(m);
    if (!await confirmDialog(`Delete "${m.title}"?`, { danger: true, okLabel: 'Delete' })) return;
    await syncMaterialToViews({ ...m, studentIds: [] }, store.students, m.studentIds || []);
    await deleteDoc(doc(db, 'materials', m.id));
    await loadMaterials(); draw(); toast('Deleted');
  });

  function form(m) {
    openModal({
      title: m ? 'Edit material' : 'Add material',
      body: `
        <label>Title</label><input id="m-title" value="${esc(m?.title || '')}">
        <label>Type</label><select id="m-type">${TYPES.map(t => `<option ${m?.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label>Subject (optional)</label><input id="m-sub" value="${esc(m?.subject || '')}">
        <label>Link (Drive, YouTube, etc.)</label><input id="m-link" value="${esc(m?.link || '')}" placeholder="https://…">
        <label>Share with</label>
        <div class="checks">${store.students.map(s => `<label class="check"><input type="checkbox" value="${esc(s.id)}" ${(m?.studentIds || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)} <span class="muted">${esc(s.className)}</span></label>`).join('') || '<span class="muted">No students</span>'}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async ctx => {
        const q = id => ctx.el.querySelector(id).value.trim();
        const title = q('#m-title'), link = q('#m-link');
        if (!title) throw new Error('Title is required');
        if (!isHttpUrl(link)) throw new Error('Link must start with http:// or https://');
        const ids = [...ctx.el.querySelectorAll('.checks input:checked')].map(i => i.value);
        const id = m?.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        const rec = { title, type: q('#m-type'), subject: q('#m-sub'), link, studentIds: ids, createdAt: m?.createdAt || new Date().toISOString() };
        await setDoc(doc(db, 'materials', id), rec);
        await syncMaterialToViews({ id, ...rec }, store.students, m?.studentIds || []);
        await loadMaterials(); draw(); toast('Saved');
      } }]
    });
  }
}
