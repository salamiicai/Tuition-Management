import { auth, db, doc, setDoc, signOut } from '../firebase.js';
import { store, loadAll, loadTeacher, loadTemplates } from '../store.js';
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS } from '../templates.js';
import { toast, confirmDialog } from '../ui.js';
import { esc, downloadText, todayYMD } from '../utils.js';
import { rebuildAllViews } from '../viewsync.js';
import { exportBackup, importFile, describeFile } from '../transfer.js';

export async function mount(el) {
  const t = store.teacher;
  el.innerHTML = `
    <h2>Settings</h2>
    <div class="card"><h3>Public profile</h3>
      <p class="muted">Shown at the top of every student page.</p>
      <label>Your name</label><input id="p-name" value="${esc(t.name)}" placeholder="Fardin (DU Physics)">
      <label>Short bio (optional)</label><input id="p-bio" value="${esc(t.bio)}">
      <label>Credit goal (optional)</label><input id="p-goal" type="number" min="0" value="${esc(t.creditGoal ?? 5000)}">
      <button class="btn btn-primary" id="p-save" style="margin-top:12px">Save profile</button></div>

    <div class="card" style="margin-top:14px"><h3>WhatsApp messages</h3>
      ${TEMPLATE_KEYS.map(k => `<label>${esc(DEFAULT_TEMPLATES[k].label)}</label>
        <textarea data-tpl="${k}">${esc(store.templates[k] ?? DEFAULT_TEMPLATES[k].text)}</textarea>
        <div class="muted">Placeholders: ${DEFAULT_TEMPLATES[k].vars.concat('teacher').map(v => `{${v}}`).join(' ')}</div>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="t-save">Save messages</button>
      <button class="btn" id="t-reset">Reset to default</button></div></div>

    <div class="card" style="margin-top:14px"><h3>Backup &amp; import</h3>
      <p class="muted">Import the JSON from <b>export-legacy.html</b> (old system) or a backup of this system. Safe to repeat.</p>
      <div class="row"><button class="btn" id="b-down"><i class="fas fa-download"></i> Download backup</button>
      <input type="file" id="b-file" accept=".json,application/json" style="max-width:260px"></div>
      <pre id="b-log" class="msg-preview hidden" style="margin-top:10px"></pre>
      <button class="btn btn-primary hidden" id="b-go" style="margin-top:10px">Import this file</button></div>

    <div class="card" style="margin-top:14px"><h3>Student pages</h3>
      <p class="muted">Rebuilds every student's page from your data (use after importing).</p>
      <button class="btn" id="rebuild"><i class="fas fa-sync"></i> Rebuild student pages</button>
      <div class="muted" id="rb-log" style="margin-top:8px"></div></div>`;

  const $ = s => el.querySelector(s);
  $('#p-save').onclick = async () => {
    await setDoc(doc(db, 'public', 'teacher'), { name: $('#p-name').value.trim(), bio: $('#p-bio').value.trim(), creditGoal: Number($('#p-goal').value) || 0 }, { merge: true });
    await loadTeacher(); document.getElementById('brand').textContent = document.getElementById('brand2').textContent = store.teacher.name || 'Teacher dashboard'; toast('Saved');
  };
  $('#t-save').onclick = async () => {
    const o = {}; el.querySelectorAll('[data-tpl]').forEach(x => o[x.dataset.tpl] = x.value);
    await setDoc(doc(db, 'config', 'templates'), o); await loadTemplates(); toast('Saved');
  };
  $('#t-reset').onclick = async () => {
    if (!await confirmDialog('Reset all messages to the defaults?')) return;
    await setDoc(doc(db, 'config', 'templates'), {}); await loadTemplates(); mount(el);
  };
  $('#b-down').onclick = async () => {
    downloadText(`home-tutor-backup-${todayYMD()}.json`, JSON.stringify(await exportBackup(), null, 1)); toast('Backup downloaded');
  };
  let parsed = null;
  const log = m => { const l = $('#b-log'); l.classList.remove('hidden'); l.textContent += m + '\n'; };
  $('#b-file').onchange = async e => {
    $('#b-log').textContent = ''; $('#b-go').classList.add('hidden'); parsed = null;
    const f = e.target.files[0]; if (!f) return;
    try { parsed = JSON.parse(await f.text()); } catch { return toast('Not a valid JSON file', 'err'); }
    const d = describeFile(parsed);
    if (!d) { parsed = null; return toast('Unrecognised file', 'err'); }
    log(`${d.kind}\n${d.counts}`); $('#b-go').classList.remove('hidden');
  };
  $('#b-go').onclick = async () => {
    if (!parsed) return;
    $('#b-go').disabled = true;
    try { log('---'); await importFile(parsed, log); await loadAll(); toast('Import finished. Now rebuild student pages.'); }
    catch (e) { log('ERROR: ' + e.message); toast(e.message, 'err', 6000); }
    $('#b-go').disabled = false;
  };
  $('#rebuild').onclick = async () => {
    $('#rebuild').disabled = true;
    try { const n = await rebuildAllViews((i, tot, name) => { $('#rb-log').textContent = `${i}/${tot}: ${name}`; }); toast(`Rebuilt ${n} student pages`); }
    catch (e) { toast(e.message, 'err', 6000); }
    $('#rebuild').disabled = false;
  };
}
