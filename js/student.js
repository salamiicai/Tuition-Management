import { db, doc, getDoc, getDocs, collection } from './firebase.js';
import { esc, isValidToken, isHttpUrl, fmtYMD, fmtISODate } from './utils.js';
import { ringSvg, sparkline, countUp, toggleTheme } from './fx.js';
import { registerSW, setStudentManifest, canInstall, promptInstall, onInstallChange, isStandalone, isIOS, pushConfigured, pushSupported, pushPermission, isPushOn, enablePush } from './pwa.js';
registerSW();

const root = document.getElementById('root');
const token = new URLSearchParams(location.search).get('t');
const ICON = { Note: 'fa-note-sticky', Exam: 'fa-pen-to-square', Video: 'fa-circle-play', Link: 'fa-link', PDF: 'fa-file-pdf', Other: 'fa-shapes' };

function fail(msg) {
  root.innerHTML = `<div class="center-wrap"><div class="card login-card" style="text-align:center"><div class="logo"><i class="fas fa-link-slash"></i></div><h3>${esc(msg)}</h3><p class="muted">Please ask your teacher for your personal link.</p></div></div>`;
}

const matCard = m => `
  <div class="card hover"><div class="row" style="flex-wrap:nowrap">
    <div class="type-ico t-${esc(m.type)}"><i class="fas ${ICON[m.type] || 'fa-file'}"></i></div>
    <div style="flex:1;min-width:0"><div class="title">${esc(m.title)}</div><div class="muted">${m.subject ? `<span class="chip">${esc(m.subject)}</span> ` : ''}${esc(m.type)}</div>${m.description ? `<div class="muted" style="margin-top:3px">${esc(m.description)}</div>` : ''}</div>
    ${isHttpUrl(m.link) ? `<a class="btn btn-primary btn-sm" href="${esc(m.link)}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
  </div></div>`;

const empty = (ico, text) => `<div class="card empty"><div class="orb"><i class="fas ${ico}"></i></div>${esc(text)}</div>`;

async function main() {
  if (!isValidToken(token)) return fail('This link is not valid');
  const [vs, ts] = await Promise.all([getDoc(doc(db, 'studentViews', token)), getDoc(doc(db, 'public', 'teacher'))]);
  if (!vs.exists()) return fail('This link is not valid');
  const s = vs.data(), t = ts.exists() ? ts.data() : {};
  const sub = async n => (await getDocs(collection(db, 'studentViews', token, n))).docs.map(d => ({ id: d.id, ...d.data() }));
  const [materials, results, nanoExams, attempts] = await Promise.all([sub('materials'), sub('results'), sub('nano'), sub('attempts')]);
  nanoExams.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const attemptOf = id => attempts.find(a => a.id === id);
  materials.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  results.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  document.title = `${s.name} – dashboard`;
  setStudentManifest(t.name ? `${t.name}${t.bio ? ' · ' + t.bio : ''}` : 'My dashboard', t.name || 'My dashboard');

  const att = s.attendance || {};
  const months = [...(att.months || [])].sort((a, b) => b.monthNumber - a.monthNumber);
  const cur = months.find(m => m.monthNumber === att.currentMonthNumber);
  const first = esc(String(s.name || '').split(' ')[0]);
  const goal = Number(t.creditGoal) || 0, credits = (Number(s.creditsBase) || 0) + attempts.reduce((a, x) => a + (Number(x.creditsEarned) || 0), 0);
  const finals = results.filter(r => r.status !== 'pending' && r.pct != null);
  let subject = 'All', mtype = 'All', mq = '';

  const views = {
    home: () => {
      const n = cur ? cur.days.length : 0;
      const last = finals[0];
      return `<div class="stack">
        <div class="card ringcard">
          ${ringSvg({ value: n, max: Math.max(12, n), size: 170, stroke: 14, center: cur ? `<span data-count="${n}">0</span>` : '–', sub: cur ? 'CLASSES THIS MONTH' : 'NO ACTIVE MONTH' })}
          <div class="muted" style="margin-top:10px">${cur ? `Month ${cur.monthNumber} · since ${fmtYMD(cur.startDate)}` : 'Your next month will appear here.'}</div>
          ${cur ? `<div class="dots">${cur.days.map((_, i) => `<span class="dot" style="animation-delay:${0.4 + i * 0.06}s"></span>`).join('')}</div>` : ''}
        </div>
        <div class="two">
          <div class="card"><div class="muted">Materials</div><div class="stat" data-count="${materials.length}">0</div></div>
          <div class="card"><div class="muted">Total classes</div><div class="stat" data-count="${months.reduce((a, m) => a + (m.days || []).length, 0)}">0</div></div>
        </div>
        ${nanoExams.some(x => !attemptOf(x.id)) ? `<div class="card hover" data-go="nano" style="cursor:pointer;background:var(--grad);color:#fff;border:0"><div class="row between"><div><b>⚡ New Nano exam waiting</b><div style="opacity:.9">${esc(nanoExams.find(x => !attemptOf(x.id)).title)}</div></div><i class="fas fa-arrow-right"></i></div></div>` : ''}
        ${materials[0] ? `<div><div class="muted" style="margin:6px 4px">Latest material</div>${matCard(materials[0])}</div>` : ''}
        ${last ? `<div class="card"><div class="row between" style="flex-wrap:nowrap"><div style="min-width:0"><div class="muted">Last result</div><div class="title">${esc(last.title)}</div><div class="muted">${last.date ? fmtISODate(last.date) : ''}</div></div>
          ${ringSvg({ value: last.pct, max: 100, size: 78, stroke: 8, center: `<span style="font-size:1.1rem">${esc(last.pct)}%</span>` })}</div></div>` : ''}
      </div>`;
    },
    materials: () => {
      const subs = ['All', ...new Set(materials.map(m => m.subject).filter(Boolean))];
      const types = ['All', ...new Set(materials.map(m => m.type).filter(Boolean))];
      const list = materials.filter(m => (subject === 'All' || m.subject === subject) && (mtype === 'All' || m.type === mtype)
        && (!mq || `${m.title} ${m.subject} ${m.type} ${m.description || ''}`.toLowerCase().includes(mq)));
      return `<div class="card" style="padding:12px;margin-bottom:12px"><input id="mq" placeholder="🔍 Search materials…" value="${esc(mq)}">
        ${subs.length > 2 ? `<div class="chips" style="margin-top:10px" data-f="sub">${subs.map(x => `<button class="chip ${x === subject ? 'active' : ''}" data-sub="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
        ${types.length > 2 ? `<div class="chips" data-f="type">${types.map(x => `<button class="chip ${x === mtype ? 'active' : ''}" data-ty="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}</div>
        <div class="stack stagger" id="mlist">${list.length ? list.map(matCard).join('') : empty('fa-book-open', materials.length ? 'Nothing matches your search.' : 'No materials yet, check back soon.')}</div>`;
    },
    nano: () => nanoExams.length ? `<div class="stack stagger">${nanoExams.map(x => {
      const a = attemptOf(x.id), url = `exam.html?t=${encodeURIComponent(token)}&e=${encodeURIComponent(x.id)}`;
      return `<div class="card hover"><div class="row between" style="flex-wrap:nowrap"><div style="min-width:0"><div class="title">${esc(x.title)}</div>
        <div class="muted">${x.total} questions · ${x.totalMinutes} min · ⭐ ${x.points} each</div>
        ${a ? `<div style="margin-top:6px"><span class="chip ok">${a.correct}/${a.total} correct · +${a.creditsEarned} ⭐</span></div>` : '<div style="margin-top:6px"><span class="chip warn">Not attempted</span></div>'}</div>
        <a class="btn ${a ? '' : 'btn-primary'} btn-sm" href="${esc(url)}">${a ? 'Practice' : 'Start'}</a></div></div>`; }).join('')}</div>`
      : empty('fa-bolt', 'No Nano exams yet.'),
    attendance: () => months.length ? `<div class="stack stagger">${months.map(m => `<div class="card">
        <div class="row between"><h3>Month ${m.monthNumber}</h3><span class="chip ${m.monthNumber === att.currentMonthNumber ? 'ok' : ''}">${m.monthNumber === att.currentMonthNumber ? 'Current' : 'Ended'}</span></div>
        <div class="muted">${fmtYMD(m.startDate)}${m.endDate ? ' → ' + fmtYMD(m.endDate) : ''} · ${(m.days || []).length} classes</div>
        <div class="cal">${(m.days || []).map((d, i) => `<span class="day" style="animation-delay:${i * 0.04}s">${m.monthNumber}.${d.dayNumber} · ${fmtYMD(d.date)}</span>`).join('')}</div></div>`).join('')}</div>`
      : empty('fa-calendar-check', 'No classes recorded yet.'),
    results: () => `<div class="stack">
      ${finals.length > 1 ? `<div class="card"><div class="muted">Your progress</div>${sparkline(finals.slice(0, 6).reverse().map(r => r.pct))}</div>` : ''}
      <div class="stack stagger">${results.length ? results.map(r => `<div class="card"><div class="row between" style="flex-wrap:nowrap">
        <div style="min-width:0"><div class="title">${esc(r.title)}</div><div class="muted">${r.date ? fmtISODate(r.date) : ''}${r.code ? ' · ' + esc(r.code) : ''}</div></div>
        ${r.status === 'pending' ? '<span class="chip warn">Pending</span>' : `<div style="text-align:right"><div class="stat" style="font-size:1.5rem">${r.pct != null ? esc(r.pct) + '%' : ''}</div><div class="muted">${esc(r.scoreText || '')}</div></div>`}</div></div>`).join('') : empty('fa-chart-line', 'No results yet.')}</div></div>`,
    me: () => `<div class="stack"><div class="card" style="text-align:center"><div class="avatar" style="width:80px;height:80px;font-size:1.6rem;margin:0 auto 12px">${esc(String(s.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
      <h3>${esc(s.name)}</h3><div class="muted">${esc(s.className)}${s.school ? ' · ' + esc(s.school) : ''}</div>
      ${credits > 0 ? `<div style="margin-top:14px"><span class="chip ok">⭐ ${credits}${goal ? ' / ' + goal : ''} credits</span>${goal ? `<div style="height:8px;border-radius:9px;background:var(--line);margin-top:10px;overflow:hidden"><div style="height:100%;width:${Math.min(100, credits / goal * 100)}%;background:var(--grad)"></div></div>` : ''}</div>` : ''}</div>
      <div class="card muted" style="text-align:center">🔒 This link is private. Please keep it safe.</div>
      ${pushConfigured() ? `<div class="card" id="pushcard" style="text-align:center"><div style="font-size:1.8rem">🔔</div><h3>Notifications</h3><div class="muted" id="push-msg">Checking…</div>
        <button class="btn btn-primary hidden" id="push-btn" style="margin-top:10px">Turn on notifications</button></div>` : ''}
      ${isStandalone() ? '' : `<div class="card" id="install" style="text-align:center"><img src="icons/icon-192.png" alt="" width="64" height="64" style="border-radius:16px;box-shadow:var(--sh)"><h3 style="margin-top:10px">Add to your home screen</h3>
        <div class="muted" id="install-msg">${isIOS() ? 'Tap the Share button, then “Add to Home Screen”.' : 'Open it like an app, in one tap.'}</div>
        <button class="btn btn-primary hidden" id="install-btn" style="margin-top:10px"><i class="fas fa-download"></i> Install app</button></div>`}
      <button class="btn btn-block" id="theme"><i class="fas fa-circle-half-stroke"></i> Switch theme</button></div>`
  };
  const tabs = [['home', 'Home', 'fa-house'], ['materials', 'Materials', 'fa-book-open'], ['attendance', 'Classes', 'fa-calendar-check'], ['nano', 'Nano', 'fa-bolt'], ['results', 'Results', 'fa-chart-line'], ['me', 'Me', 'fa-user']];
  let active = 'home';

  root.innerHTML = `
    <div class="hero"><div class="inner"><p>${esc(t.name || 'Your teacher')}${t.bio ? ' · ' + esc(t.bio) : ''}</p>
      <h1>Hey ${first} 👋</h1><p>${esc(s.className)}</p>
      ${credits > 0 ? `<span class="pill">⭐ ${credits}${goal ? ' / ' + goal : ''} credits</span>` : ''}</div></div>
    <div class="spage" id="sv"></div>
    <nav class="bottomnav">${tabs.map(x => `<button class="nav-btn" data-k="${x[0]}"><i class="fas ${x[2]}"></i><span>${x[1]}</span></button>`).join('')}</nav>`;

  const sv = document.getElementById('sv');
  const show = k => {
    active = k;
    root.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.k === k));
    sv.innerHTML = `<div class="view-in">${views[k]()}</div>`;
    countUp(sv);
    if (k === 'me') refreshPush();
    if (k === 'me') requestAnimationFrame(() => { const b = document.getElementById('install-btn'); if (b) b.classList.toggle('hidden', !canInstall()); });
    if (k !== 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  root.querySelector('.bottomnav').onclick = e => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) show(k); };
  sv.addEventListener('click', e => {
    const c = e.target.closest('[data-sub]');
    if (c) { subject = c.dataset.sub; show('materials'); return; }
    const ty = e.target.closest('[data-ty]');
    if (ty) { mtype = ty.dataset.ty; show('materials'); return; }
    if (e.target.closest('#theme')) toggleTheme();
    if (e.target.closest('#install-btn')) promptInstall();
    if (e.target.closest('#push-btn')) { const b = e.target.closest('#push-btn'); b.disabled = true; enablePush(token).then(refreshPush).catch(err => { alert(err.message); refreshPush(); }); }
    const gt = e.target.closest('[data-go]'); if (gt) show(gt.dataset.go);
  });
  sv.addEventListener('input', e => {
    if (e.target.id !== 'mq') return;
    mq = e.target.value.trim().toLowerCase();
    const list = materials.filter(m => (subject === 'All' || m.subject === subject) && (mtype === 'All' || m.type === mtype)
      && (!mq || `${m.title} ${m.subject} ${m.type} ${m.description || ''}`.toLowerCase().includes(mq)));
    document.getElementById('mlist').innerHTML = list.length ? list.map(matCard).join('') : empty('fa-book-open', 'Nothing matches your search.');
  });
  async function refreshPush() {
    const msg = document.getElementById('push-msg'), btn = document.getElementById('push-btn'); if (!msg) return;
    btn.disabled = false;
    if (!pushSupported()) { msg.textContent = isIOS() ? 'On iPhone, first add this page to your Home Screen (Share → Add to Home Screen), then open it from there.' : 'This browser does not support notifications.'; btn.classList.add('hidden'); return; }
    if (await isPushOn()) { msg.textContent = '✅ On. You will be notified about new exams, materials and results.'; btn.classList.add('hidden'); return; }
    if (pushPermission() === 'denied') { msg.textContent = 'Notifications are blocked. Allow them in your browser or phone settings for this site.'; btn.classList.add('hidden'); return; }
    msg.textContent = 'Get a notification when a new exam, material or result is added.'; btn.classList.remove('hidden');
  }
  const syncInstall = () => { const b = document.getElementById('install-btn'); if (b) b.classList.toggle('hidden', !canInstall()); };
  onInstallChange(syncInstall);
  const h0 = location.hash.slice(1);
  show(tabs.some(x => x[0] === h0) ? h0 : 'home');
}
main().catch(e => { console.error(e); fail('Could not load your dashboard'); });
