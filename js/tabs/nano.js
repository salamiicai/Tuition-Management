// Nano Library: library list, add/edit question, bulk import, routes, exams.
import { db, doc, setDoc, deleteDoc, collection, getDocs } from '../firebase.js';
import { store, addSubject } from '../store.js';
import { openModal, confirmDialog, toast, copyText } from '../ui.js';
import { esc, randomToken } from '../utils.js';
import { richHtml, imgHtml } from '../math.js';
import { batchWrite } from '../viewsync.js';
import { CLASSES, classLabel, TYPES, VERSIONS, normalizeQuestion, AI_PROMPT } from '../nano.js';
import { mountExams } from './nanoexams.js';

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
let sticky = { class: '5', subject: '', version: 'bn', chapter: '', topic: '' };   // step 1 is remembered between questions

export const nano = { questions: [], taxonomy: {} };
export async function loadNano() {
  const [qs, tx] = await Promise.all([getDocs(collection(db, 'nanoQuestions')), getDocs(collection(db, 'config'))]);
  nano.questions = qs.docs.map(d => ({ id: d.id, ...d.data() }));
  const t = tx.docs.find(d => d.id === 'taxonomy');
  nano.taxonomy = t ? (t.data().tree || {}) : {};
}
const saveTax = () => setDoc(doc(db, 'config', 'taxonomy'), { tree: nano.taxonomy });
// merge class/subject/chapter/topic of a question into the route tree
function learnRoute(q) {
  const tr = nano.taxonomy; tr[q.class] ||= {}; tr[q.class][q.subject] ||= {}; tr[q.class][q.subject][q.chapter] ||= [];
  if (q.topic && !tr[q.class][q.subject][q.chapter].includes(q.topic)) tr[q.class][q.subject][q.chapter].push(q.topic);
}
export const subjectsFor = cls => [...new Set([...Object.keys(nano.taxonomy[cls] || {}), ...store.subjects])].sort();
export const chaptersFor = (cls, sub) => Object.keys((nano.taxonomy[cls] || {})[sub] || {});
const topicsFor = (cls, sub, ch) => (((nano.taxonomy[cls] || {})[sub] || {})[ch]) || [];
const opts = (arr, sel) => arr.map(x => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

export async function mount(el) {
  await loadNano();
  let sub = 'lib', editing = null;
  const SUBS = [['lib', 'Library'], ['add', 'Add'], ['bulk', 'Bulk import'], ['exams', 'Exams'], ['routes', 'Routes']];
  const box = document.createElement('div');
  const nav = document.createElement('div');
  nav.className = 'chips';
  el.append(Object.assign(document.createElement('h2'), { textContent: 'Nano' }), nav, box);
  const go = (s, q = null) => {
    sub = s; editing = q;
    nav.innerHTML = SUBS.map(([k, l]) => `<button class="chip ${k === sub ? 'active' : ''}" data-s="${k}">${l}</button>`).join('');
    const fresh = document.createElement('div'); fresh.className = 'view-in'; box.replaceChildren(fresh);
    ({ lib: libView, add: addView, bulk: bulkView, routes: routesView, exams: examsView })[sub](fresh);
  };
  nav.onclick = e => { const s = e.target.dataset.s; if (s) go(s); };
  const libView = c => library(c, q => go('add', q));
  const addView = c => addQuestion(c, editing, () => go('lib'));
  const bulkView = c => bulk(c, () => go('lib'));
  const routesView = c => routes(c);
  const examsView = c => mountExams(c, nano);
  go('lib');
}

/* ---------------- library ---------------- */
function library(el, onEdit) {
  let f = { class: '', subject: '', chapter: '', version: '', type: '', status: '', q: '' }, limit = 30;
  const draw = () => {
    const list = nano.questions.filter(q => (!f.class || q.class === f.class) && (!f.subject || q.subject === f.subject) && (!f.chapter || q.chapter === f.chapter)
      && (!f.version || q.version === f.version) && (!f.type || q.type === f.type) && (!f.status || q.status === f.status)
      && (!f.q || `${q.q} ${q.topic}`.toLowerCase().includes(f.q)))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const subjects = [...new Set(nano.questions.map(q => q.subject))].sort();
    const chapters = [...new Set(nano.questions.filter(q => !f.subject || q.subject === f.subject).map(q => q.chapter))].sort();
    el.innerHTML = `
      <div class="card"><div class="row between"><div><b>${nano.questions.length}</b> questions · <span class="muted">${nano.questions.filter(q => q.status === 'published').length} published</span></div>
        <button class="btn btn-primary btn-sm" id="new"><i class="fas fa-plus"></i> Add question</button></div>
        <div class="two" style="margin-top:6px">
          <select data-f="class"><option value="">All classes</option>${CLASSES.map(c => `<option value="${c[0]}" ${f.class === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select>
          <select data-f="subject"><option value="">All subjects</option>${opts(subjects, f.subject)}</select>
          <select data-f="chapter"><option value="">All chapters</option>${opts(chapters, f.chapter)}</select>
          <select data-f="type"><option value="">All types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select data-f="version"><option value="">বাংলা + English</option><option value="bn" ${f.version === 'bn' ? 'selected' : ''}>বাংলা</option><option value="en" ${f.version === 'en' ? 'selected' : ''}>English</option></select>
          <select data-f="status"><option value="">Published + drafts</option><option value="published" ${f.status === 'published' ? 'selected' : ''}>Published</option><option value="draft" ${f.status === 'draft' ? 'selected' : ''}>Draft</option></select></div>
        <input id="s" placeholder="Search questions…" value="${esc(f.q)}" style="margin-top:10px"></div>
      <div class="stack stagger" style="margin-top:12px">${list.slice(0, limit).map(q => `
        <div class="card"><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0;flex:1" class="${q.version}"><div class="q-text">${richHtml(q.q)}</div>${imgHtml(q.qImage)}</div>
          <span class="chip ${q.status === 'published' ? 'ok' : 'warn'}">${esc(q.status)}</span></div>
          <div class="muted" style="margin:6px 0">${esc(classLabel(q.class))} · ${esc(q.subject)} › ${esc(q.chapter)}${q.topic ? ' › ' + esc(q.topic) : ''} · ${TYPES[q.type]} · ${VERSIONS[q.version]}</div>
          <div class="row"><button class="btn btn-sm" data-a="edit" data-id="${esc(q.id)}"><i class="fas fa-pen"></i> Edit</button>
            <button class="btn btn-sm" data-a="status" data-id="${esc(q.id)}">${q.status === 'published' ? 'Make draft' : 'Publish'}</button>
            <button class="btn btn-sm" data-a="del" data-id="${esc(q.id)}"><i class="fas fa-trash"></i></button></div></div>`).join('')
        || '<div class="card empty"><div class="orb"><i class="fas fa-layer-group"></i></div>No questions match. Add your first question or import in bulk.</div>'}
        ${list.length > limit ? `<button class="btn btn-block" id="more">Show more (${list.length - limit})</button>` : ''}</div>`;
    const s = el.querySelector('#s'); if (f.q) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  };
  draw();
  el.addEventListener('change', e => { const k = e.target.dataset.f; if (!k) return; f[k] = e.target.value; if (k === 'subject') f.chapter = ''; limit = 30; draw(); });
  el.addEventListener('input', e => { if (e.target.id === 's') { f.q = e.target.value.trim().toLowerCase(); draw(); } });
  el.addEventListener('click', async e => {
    if (e.target.closest('#new')) return onEdit(null);
    if (e.target.closest('#more')) { limit += 30; return draw(); }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const q = nano.questions.find(x => x.id === b.dataset.id); if (!q) return;
    if (b.dataset.a === 'edit') return onEdit(q);
    if (b.dataset.a === 'status') {
      q.status = q.status === 'published' ? 'draft' : 'published';
      await setDoc(doc(db, 'nanoQuestions', q.id), stripId(q)); return draw();
    }
    if (!await confirmDialog('Delete this question? Exams already launched keep their own copy.', { danger: true, okLabel: 'Delete' })) return;
    await deleteDoc(doc(db, 'nanoQuestions', q.id)); nano.questions = nano.questions.filter(x => x.id !== q.id); draw(); toast('Deleted');
  });
}
const stripId = q => { const { id, ...rest } = q; return rest; };

/* ---------------- add / edit ---------------- */
function addQuestion(el, q0, done) {
  const isEdit = !!q0;
  const st = isEdit ? { class: q0.class, subject: q0.subject, version: q0.version, chapter: q0.chapter, topic: q0.topic || '' } : { ...sticky };
  let type = q0?.type || 'mcq';
  el.innerHTML = `
    <div class="card"><h3>Step 1 · Where does it belong?</h3>
      <div class="two"><div><label>Class</label><select id="s-class">${CLASSES.map(c => `<option value="${c[0]}" ${st.class === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select></div>
      <div><label>Version</label><select id="s-ver"><option value="bn" ${st.version === 'bn' ? 'selected' : ''}>বাংলা</option><option value="en" ${st.version === 'en' ? 'selected' : ''}>English</option></select></div></div>
      <div class="two"><div><label>Subject</label><input id="s-sub" list="dl-sub" value="${esc(st.subject)}" placeholder="Choose or type new"><datalist id="dl-sub"></datalist></div>
      <div><label>Chapter</label><input id="s-ch" list="dl-ch" value="${esc(st.chapter)}" placeholder="Choose or type new"><datalist id="dl-ch"></datalist></div></div>
      <label>Topic (optional)</label><input id="s-top" list="dl-top" value="${esc(st.topic)}"><datalist id="dl-top"></datalist>
      <div class="muted" style="margin-top:6px">These stay the same for the next question. New names are saved to your routes automatically.</div></div>
    <div class="card" style="margin-top:12px"><h3>Step 2 · The question</h3>
      <label style="margin-top:0">Type</label><select id="q-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label>Question <span class="muted">(LaTeX: $x^2$)</span></label><textarea id="q-q" style="min-height:90px">${esc(q0?.q || '')}</textarea>
      <label>Question image link (optional, Google Drive public link)</label><input id="q-img" value="${esc(q0?.qImage || '')}">
      <div id="type-fields"></div>
      <label>Explanation (optional)</label><textarea id="q-exp" style="min-height:70px">${esc(q0?.explain || '')}</textarea>
      <label>Explanation image link (optional)</label><input id="q-expimg" value="${esc(q0?.explainImage || '')}">
      <label class="check" style="margin-top:12px"><input type="checkbox" id="q-draft" ${q0?.status === 'draft' ? 'checked' : ''}> Save as draft (not usable in exams yet)</label>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="save">${isEdit ? 'Save changes' : 'Save & add next'}</button>${isEdit ? '<button class="btn" id="cancel">Cancel</button>' : ''}</div></div>
    <div class="card" style="margin-top:12px"><div class="muted">Live preview</div><div id="preview"></div></div>`;
  const $ = id => el.querySelector(id);

  const fillLists = () => {
    const cls = $('#s-class').value, sub = $('#s-sub').value.trim(), ch = $('#s-ch').value.trim();
    $('#dl-sub').innerHTML = subjectsFor(cls).map(x => `<option value="${esc(x)}">`).join('');
    $('#dl-ch').innerHTML = chaptersFor(cls, sub).map(x => `<option value="${esc(x)}">`).join('');
    $('#dl-top').innerHTML = topicsFor(cls, sub, ch).map(x => `<option value="${esc(x)}">`).join('');
  };
  fillLists();

  const optRow = (i, val = '', checked = false) => `<div class="row" style="flex-wrap:nowrap;margin-top:6px" data-opt><input type="radio" name="ans" ${checked ? 'checked' : ''} aria-label="correct" style="width:22px;height:22px;accent-color:var(--brand)"><b>${String.fromCharCode(65 + i)}</b><input class="o-val" value="${esc(val)}" placeholder="Option ${String.fromCharCode(65 + i)}"></div>`;
  const pairRow = (l = '', r = '') => `<div class="row" style="flex-wrap:nowrap;margin-top:6px" data-pair><input class="p-l" value="${esc(l)}" placeholder="Left"><span>↔</span><input class="p-r" value="${esc(r)}" placeholder="Right"></div>`;
  const itemRow = (i, v = '') => `<div class="row" style="flex-wrap:nowrap;margin-top:6px" data-item><b>${i + 1}</b><input class="i-val" value="${esc(v)}" placeholder="Step ${i + 1}"></div>`;

  const typeFields = () => {
    const f = $('#type-fields'), q = q0 && q0.type === type ? q0 : {};
    if (type === 'mcq') {
      const o = q.options || ['', '', '', ''];
      f.innerHTML = `<label>Options · tick the correct one</label><div id="opts">${o.map((v, i) => optRow(i, v, q.answer === i)).join('')}</div><button class="btn btn-sm" id="addopt" type="button" style="margin-top:8px">+ Option</button>`;
      f.querySelector('#addopt').onclick = () => { const n = f.querySelectorAll('[data-opt]').length; if (n < 6) f.querySelector('#opts').insertAdjacentHTML('beforeend', optRow(n)); };
    } else if (type === 'tf') {
      f.innerHTML = `<label>Correct answer</label><select id="tf"><option value="true" ${q.answer === true ? 'selected' : ''}>True</option><option value="false" ${q.answer === false ? 'selected' : ''}>False</option></select>`;
    } else if (type === 'fill') {
      f.innerHTML = `<label>Correct answer <span class="muted">(separate accepted alternatives with |)</span></label><input id="fill" value="${esc((q.answer || []).join(' | '))}">`;
    } else if (type === 'match') {
      const p = q.pairs || [{ l: '', r: '' }, { l: '', r: '' }, { l: '', r: '' }];
      f.innerHTML = `<label>Correct pairs</label><div id="pairs">${p.map(x => pairRow(x.l, x.r)).join('')}</div><button class="btn btn-sm" id="addp" type="button" style="margin-top:8px">+ Pair</button>`;
      f.querySelector('#addp').onclick = () => { if (f.querySelectorAll('[data-pair]').length < 8) f.querySelector('#pairs').insertAdjacentHTML('beforeend', pairRow()); };
    } else {
      const it = q.items || ['', '', ''];
      f.innerHTML = `<label>Items in the CORRECT order</label><div id="items">${it.map((v, i) => itemRow(i, v)).join('')}</div><button class="btn btn-sm" id="addi" type="button" style="margin-top:8px">+ Item</button>`;
      f.querySelector('#addi').onclick = () => { const n = f.querySelectorAll('[data-item]').length; if (n < 8) f.querySelector('#items').insertAdjacentHTML('beforeend', itemRow(n)); };
    }
  };
  typeFields();

  const collect = () => {
    const raw = { class: $('#s-class').value, version: $('#s-ver').value, subject: $('#s-sub').value, chapter: $('#s-ch').value, topic: $('#s-top').value,
      type, q: $('#q-q').value, qImage: $('#q-img').value, explain: $('#q-exp').value, explainImage: $('#q-expimg').value };
    if (type === 'mcq') {
      const rows = [...el.querySelectorAll('[data-opt]')];
      raw.options = rows.map(r => r.querySelector('.o-val').value);
      raw.answer = String.fromCharCode(65 + rows.findIndex(r => r.querySelector('input[type=radio]').checked));
      if (!rows.some(r => r.querySelector('input[type=radio]').checked)) raw.answer = '';
    } else if (type === 'tf') raw.answer = $('#tf').value;
    else if (type === 'fill') raw.answer = $('#fill').value;
    else if (type === 'match') raw.pairs = [...el.querySelectorAll('[data-pair]')].map(r => [r.querySelector('.p-l').value, r.querySelector('.p-r').value]);
    else raw.items = [...el.querySelectorAll('[data-item]')].map(r => r.querySelector('.i-val').value);
    return raw;
  };

  const preview = () => {
    const raw = collect(), n = normalizeQuestion(raw);
    const q = n.q;
    let body = `<div class="${raw.version} q-text">${richHtml(raw.q)}</div>${imgHtml(raw.qImage)}`;
    if (type === 'mcq') body += (q.options || []).map((o, i) => `<div class="opt-prev ${q.answer === i ? 'right' : ''}"><b>${String.fromCharCode(65 + i)}.</b> ${richHtml(o)}</div>`).join('');
    if (type === 'tf') body += `<div class="muted">Answer: ${raw.answer === 'true' ? 'True' : 'False'}</div>`;
    if (type === 'fill') body += `<div class="muted">Answer: ${esc(String(raw.answer))}</div>`;
    if (type === 'match') body += (q.pairs || []).map(p => `<div class="opt-prev">${richHtml(p.l)} ↔ ${richHtml(p.r)}</div>`).join('');
    if (type === 'order') body += (q.items || []).map((x, i) => `<div class="opt-prev"><b>${i + 1}.</b> ${richHtml(x)}</div>`).join('');
    if (raw.explain) body += `<div class="muted" style="margin-top:8px">💡 ${richHtml(raw.explain)}</div>`;
    $('#preview').innerHTML = body + (n.ok ? '' : `<div class="alert alert-warn" style="margin-top:8px">${n.errors.map(esc).join(' · ')}</div>`);
  };
  preview();
  el.addEventListener('input', e => { if (['s-class', 's-sub', 's-ch'].includes(e.target.id)) fillLists(); preview(); });
  el.addEventListener('change', e => { if (e.target.id === 'q-type') { type = e.target.value; typeFields(); } preview(); });
  $('#cancel')?.addEventListener('click', done);
  $('#save').onclick = async () => {
    const n = normalizeQuestion(collect());
    if (!n.ok) return toast(n.errors[0], 'err', 4500);
    const q = { ...n.q, status: $('#q-draft').checked ? 'draft' : 'published', source: q0?.source || 'manual', createdAt: q0?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const id = q0?.id || newId();
    $('#save').disabled = true;
    try {
      await setDoc(doc(db, 'nanoQuestions', id), q);
      learnRoute(q); await saveTax(); await addSubject(q.subject);
      const i = nano.questions.findIndex(x => x.id === id); if (i >= 0) nano.questions[i] = { id, ...q }; else nano.questions.push({ id, ...q });
      sticky = { class: q.class, subject: q.subject, version: q.version, chapter: q.chapter, topic: q.topic };
      toast(isEdit ? 'Updated' : 'Saved. Add the next one.');
      if (isEdit) done(); else { ['#q-q', '#q-img', '#q-exp', '#q-expimg'].forEach(s => $(s).value = ''); typeFields(); preview(); fillLists(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } catch (e) { toast(e.message, 'err'); }
    $('#save').disabled = false;
  };
}

/* ---------------- bulk import ---------------- */
function bulk(el, done) {
  let parsed = [];
  el.innerHTML = `
    <div class="card"><h3>Bulk import</h3>
      <ol class="muted" style="padding-left:18px;margin:0"><li>Copy the AI prompt below.</li><li>Paste it into any AI together with your questions.</li><li>Paste the JSON it gives you here and preview.</li></ol>
      <div class="row" style="margin-top:10px"><button class="btn" id="cp"><i class="fas fa-copy"></i> Copy AI prompt</button></div>
      <h3 style="margin-top:18px">Defaults (used when the JSON leaves a field out)</h3>
      <div class="two"><select id="d-class">${CLASSES.map(c => `<option value="${c[0]}" ${sticky.class === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select>
      <select id="d-ver"><option value="bn" ${sticky.version === 'bn' ? 'selected' : ''}>বাংলা</option><option value="en" ${sticky.version === 'en' ? 'selected' : ''}>English</option></select>
      <input id="d-sub" placeholder="Subject" value="${esc(sticky.subject)}"><input id="d-ch" placeholder="Chapter" value="${esc(sticky.chapter)}"></div>
      <input id="d-top" placeholder="Topic (optional)" value="${esc(sticky.topic)}" style="margin-top:12px">
      <label>Paste JSON here</label><textarea id="json" style="min-height:200px;font-family:ui-monospace,monospace;font-size:.8rem"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="prev">Preview</button></div></div>
    <div id="out"></div>`;
  const $ = id => el.querySelector(id);
  $('#cp').onclick = async () => { await copyText(AI_PROMPT); toast('Prompt copied'); };
  $('#prev').onclick = () => {
    let arr;
    try { arr = JSON.parse($('#json').value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '')); } catch (e) { return toast('That is not valid JSON: ' + e.message, 'err', 5000); }
    if (!Array.isArray(arr)) arr = arr?.questions;
    if (!Array.isArray(arr)) return toast('Expected a JSON array of questions', 'err');
    const defaults = { class: $('#d-class').value, version: $('#d-ver').value, subject: $('#d-sub').value, chapter: $('#d-ch').value, topic: $('#d-top').value };
    const have = new Set(nano.questions.map(q => q.hash)), seen = new Set();
    parsed = arr.map((r, i) => {
      const n = normalizeQuestion(r, defaults);
      const dup = n.ok && (have.has(n.q.hash) || seen.has(n.q.hash)); if (n.ok) seen.add(n.q.hash);
      return { i: i + 1, ...n, dup };
    });
    const good = parsed.filter(p => p.ok && !p.dup);
    $('#out').innerHTML = `<div class="card" style="margin-top:12px"><h3>${good.length} ready · ${parsed.filter(p => p.dup).length} duplicates · ${parsed.filter(p => !p.ok).length} with errors</h3>
      <div class="stack" style="max-height:380px;overflow:auto">${parsed.map(p => `<div class="list-item"><div class="grow"><div class="muted">#${p.i} · ${p.ok ? TYPES[p.q.type] : 'error'}</div>
        <div>${p.ok ? richHtml(p.q.q).slice(0, 400) : ''}</div>${p.ok ? '' : `<div class="alert alert-err">${p.errors.map(esc).join(' · ')}</div>`}</div>
        <span class="chip ${p.dup ? 'warn' : p.ok ? 'ok' : ''}">${p.dup ? 'duplicate' : p.ok ? 'ok' : 'skip'}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="imp" ${good.length ? '' : 'disabled'}>Import ${good.length} as published</button>
      <button class="btn" id="impd" ${good.length ? '' : 'disabled'}>Import as drafts</button></div></div>`;
    const run = async status => {
      const now = new Date().toISOString(); const ops = [];
      good.forEach(p => { const q = { ...p.q, status, source: 'bulk', createdAt: now }; const id = newId(); ops.push({ type: 'set', ref: doc(db, 'nanoQuestions', id), data: q }); nano.questions.push({ id, ...q }); learnRoute(q); });
      await batchWrite(ops); await saveTax();
      for (const s of new Set(good.map(p => p.q.subject))) await addSubject(s);
      toast(`${good.length} questions imported`); done();
    };
    $('#imp').onclick = () => run('published'); $('#impd').onclick = () => run('draft');
  };
}

/* ---------------- routes ---------------- */
function routes(el) {
  let cls = sticky.class || '5', sub = '', ch = '';
  const draw = () => {
    const tree = nano.taxonomy[cls] || {};
    const subs = Object.keys(tree).sort();
    if (!tree[sub]) sub = '';
    const chs = sub ? Object.keys(tree[sub]).sort() : [];
    if (!sub || !tree[sub][ch]) ch = '';
    const tops = ch ? tree[sub][ch] : [];
    const col = (title, items, key, selected) => `<div class="card"><h3>${title}</h3>
      ${items.map(x => `<div class="list-item" style="padding:8px 0"><div class="grow ${key !== 'top' && x === selected ? 'title' : ''}" ${key !== 'top' ? `data-pick="${key}" data-v="${esc(x)}" style="cursor:pointer"` : ''}>${key !== 'top' && x === selected ? '▸ ' : ''}${esc(x)}</div><button class="btn btn-sm" data-del="${key}" data-v="${esc(x)}">&times;</button></div>`).join('') || '<div class="muted">Nothing yet</div>'}
      <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input data-new="${key}" placeholder="Add…"><button class="btn btn-sm" data-add="${key}">Add</button></div></div>`;
    el.innerHTML = `<div class="card"><label style="margin-top:0">Class</label><select id="r-cls">${CLASSES.map(c => `<option value="${c[0]}" ${c[0] === cls ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select>
      <div class="muted" style="margin-top:6px">Routes make adding questions fast: pick a class, then its subjects, chapters and topics appear as suggestions.</div></div>
      <div class="grid" style="margin-top:12px">${col('Subjects', subs, 'sub', sub)}${sub ? col('Chapters', chs, 'ch', ch) : ''}${ch ? col('Topics', tops, 'top', '') : ''}</div>`;
  };
  draw();
  el.addEventListener('change', e => { if (e.target.id === 'r-cls') { cls = e.target.value; sub = ch = ''; draw(); } });
  el.addEventListener('click', async e => {
    const tr = nano.taxonomy; tr[cls] ||= {};
    const pick = e.target.closest('[data-pick]');
    if (pick) { if (pick.dataset.pick === 'sub') { sub = pick.dataset.v; ch = ''; } else ch = pick.dataset.v; return draw(); }
    const add = e.target.closest('[data-add]');
    if (add) {
      const key = add.dataset.add, inp = el.querySelector(`[data-new="${key}"]`), v = inp.value.trim(); if (!v) return;
      if (key === 'sub') { tr[cls][v] ||= {}; sub = v; ch = ''; await addSubject(v); }
      else if (key === 'ch') { tr[cls][sub][v] ||= []; ch = v; }
      else if (!tr[cls][sub][ch].includes(v)) tr[cls][sub][ch].push(v);
      await saveTax(); return draw();
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const key = del.dataset.del, v = del.dataset.v;
      if (!await confirmDialog(`Remove "${v}" from routes? Existing questions are not deleted.`, { danger: true, okLabel: 'Remove' })) return;
      if (key === 'sub') delete tr[cls][v]; else if (key === 'ch') delete tr[cls][sub][v]; else tr[cls][sub][ch] = tr[cls][sub][ch].filter(x => x !== v);
      await saveTax(); draw();
    }
  });
}
