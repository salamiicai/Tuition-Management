// Install support: service worker, install prompt, and a per-student manifest.
import { db, doc, setDoc, serverTimestamp } from './firebase.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { hashText } from './utils.js';
let deferred = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; listeners.forEach(f => f()); });
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const canInstall = () => !!deferred;
export const onInstallChange = f => listeners.add(f);
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt(); const r = await deferred.userChoice; deferred = null; listeners.forEach(f => f());
  return r.outcome === 'accepted';
}

// Students install THEIR own page: the manifest's start_url keeps their private token.
export function setStudentManifest(name, shortName) {
  const abs = p => new URL(p, location.href).href;
  const m = {
    name: name || 'My dashboard', short_name: (shortName || 'My dashboard').slice(0, 12),
    start_url: location.href, scope: new URL('./', location.href).href, display: 'standalone', orientation: 'portrait',
    background_color: '#0E1020', theme_color: '#6D5EF5',
    icons: [
      { src: abs('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: abs('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: abs('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
  document.head.appendChild(link);
}

// ---- Student push subscription ----
export const pushConfigured = () => !!VAPID_PUBLIC_KEY;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => ('Notification' in window ? Notification.permission : 'denied');
const keyBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

export async function isPushOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && await reg.pushManager.getSubscription());
}
export async function enablePush(token) {
  if (!pushSupported()) throw new Error('This browser does not support notifications.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  await setDoc(doc(db, 'studentViews', token, 'push', hashText(j.endpoint)), {
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 120), createdAt: serverTimestamp()
  });
}
