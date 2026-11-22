import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { ADMIN_EMAIL } from './config.js';
import { store, loadAll } from './store.js';
import { toast } from './ui.js';
import { esc } from './utils.js';
import { toggleTheme } from './fx.js';
import { registerSW } from './pwa.js';
registerSW();

const TABS = [
  ['overview', 'Home', 'fa-house', () => import('./tabs/overview.js')],
  ['students', 'Students', 'fa-user-group', () => import('./tabs/students.js')],
  ['attendance', 'Classes', 'fa-calendar-check', () => import('./tabs/attendance.js')],
  ['materials', 'Materials', 'fa-book-open', () => import('./tabs/materials.js')],
  ['nano', 'Nano', 'fa-bolt', () => import('./tabs/nano.js')],
  ['offline', 'Exams', 'fa-file-pen', () => import('./tabs/offline.js')],
  ['settings', 'Settings', 'fa-gear', () => import('./tabs/settings.js')]
];
const $ = id => document.getElementById(id);
let navToken = 0;

async function route() {
  const key = (location.hash || '#overview').slice(1).split('/')[0];
  const tab = TABS.find(t => t[0] === key) || TABS[0];
  document.querySelectorAll('.nav-btn[data-k]').forEach(b => b.classList.toggle('active', b.dataset.k === tab[0]));
  const my = ++navToken;
  const el = document.createElement('div'); el.className = 'view-in';        // fresh element per mount → no duplicate listeners
  $('view').replaceChildren(el);
  try {
    const mod = await tab[3]();
    if (my !== navToken) return;
    await mod.mount(el);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`;
  }
}

onAuthStateChanged(auth, async user => {
  const ok = user && user.emailVerified && (user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (!ok) { location.replace('login.html'); return; }
  store.user = user;
  try { await loadAll(); }
  catch (e) {
    $('boot').innerHTML = `<div class="card"><div class="alert alert-err">${esc(e.message)}</div><p class="muted">Check that the Firestore rules were published with your email.</p></div>`;
    return;
  }
  $('brand').textContent = store.teacher.name || 'Teacher dashboard';
  $('brand2').textContent = $('brand').textContent;
  const navHtml = TABS.map(t => `<button class="nav-btn" data-k="${t[0]}"><i class="fas ${t[2]}"></i><span>${t[1]}</span></button>`).join('');
  $('bnav').innerHTML = TABS.filter(t => t[0] !== 'settings').map(t => `<button class="nav-btn" data-k="${t[0]}"><i class="fas ${t[2]}"></i><span>${t[1]}</span></button>`).join(''); $('rnav').innerHTML = navHtml;
  const go = e => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) location.hash = '#' + k; };
  $('bnav').onclick = go; $('rnav').onclick = go;
  const out = async () => { await signOut(auth); location.replace('login.html'); };
  $('logout').onclick = out; $('logout2').onclick = out;
  $('theme').onclick = toggleTheme; $('theme2').onclick = toggleTheme;
  $('boot').classList.add('hidden');
  $('shell').classList.remove('hidden');
  window.addEventListener('hashchange', route);
  route();
});
window.addEventListener('unhandledrejection', e => toast(e.reason?.message || 'Error', 'err', 5000));
