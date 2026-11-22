// Small UI helpers: toast, modal, confirm, clipboard, WhatsApp.
import { waLink } from './utils.js';

export function toast(msg, type = 'ok', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/**
 * openModal({title, body (HTML string), actions:[{label, cls, onClick(ctx)}], wide})
 * onClick returning `false` keeps the modal open; throwing shows the error as a toast.
 */
export function openModal({ title = '', body = '', actions = [], wide = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><div class="modal-title"></div><button class="modal-x" aria-label="Close">&times;</button></div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>
    </div>`;
  overlay.querySelector('.modal-title').textContent = title;
  overlay.querySelector('.modal-body').innerHTML = body;
  const close = () => overlay.remove();
  const ctx = { el: overlay.querySelector('.modal'), close };
  overlay.querySelector('.modal-x').onclick = close;
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  const foot = overlay.querySelector('.modal-foot');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || 'btn-secondary');
    b.innerHTML = a.label;
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = a.onClick ? await a.onClick(ctx) : undefined;
        if (r !== false) close();
      } catch (e) {
        console.error(e);
        toast(e.message || 'Something went wrong', 'err', 5000);
      } finally { b.disabled = false; }
    };
    foot.appendChild(b);
  });
  if (!actions.length) foot.remove();
  document.body.appendChild(overlay);
  overlay.querySelector('input,textarea,select')?.focus();
  return ctx;
}

export function confirmDialog(message, { okLabel = 'Confirm', danger = false, title = 'Please confirm' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title,
      body: '<p class="confirm-msg"></p>',
      actions: [
        { label: 'Cancel', onClick: () => { finish(false); } },
        { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => { finish(true); } }
      ]
    });
    m.el.querySelector('.confirm-msg').textContent = message;
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.el)) { finish(false); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true });
  });
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
  return ok;
}

// Copies the message AND opens the guardian's WhatsApp chat with it pre-filled.
// If the browser blocks the pop-up, shows a button the user can tap instead.
export async function sendWhatsApp(number, text) {
  await copyText(text);
  const url = waLink(number, text);
  const w = window.open(url, '_blank');
  if (!w) {
    openModal({
      title: 'Open WhatsApp',
      body: `<p class="muted" style="margin-bottom:10px">Your browser blocked the pop-up. The message is already copied.</p><pre class="msg-preview"></pre>`,
      actions: [
        { label: 'Close' },
        { label: '<i class="fab fa-whatsapp"></i> Open WhatsApp', cls: 'btn-primary', onClick: () => { window.open(url, '_blank'); return false; } }
      ]
    }).el.querySelector('.msg-preview').textContent = text;
  } else {
    toast('Message copied & WhatsApp opened');
  }
}
