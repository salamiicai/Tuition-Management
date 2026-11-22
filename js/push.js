// Teacher side: send push notifications through the free Cloudflare Worker.
import { auth, db, collection, getDocs, deleteDoc, doc } from './firebase.js';
import { PUSH_WORKER_URL, VAPID_PUBLIC_KEY } from './config.js';
import { store } from './store.js';
import { toast } from './ui.js';

export const pushReady = () => !!(PUSH_WORKER_URL && VAPID_PUBLIC_KEY);

export async function subsOf(student) {
  if (!student?.token) return [];
  return (await getDocs(collection(db, 'studentViews', student.token, 'push'))).docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * notify(studentIds, {title, body, tab, tag})  → { sent, failed, none }  (null if push is not set up)
 * `tab` opens that tab on the student's dashboard (e.g. 'nano', 'materials', 'results').
 */
export async function notify(studentIds, { title, body, tab = '', tag = '' }, { quiet = false } = {}) {
  if (!pushReady()) return null;
  const targets = store.students.filter(s => studentIds.includes(s.id) && s.token);
  const messages = [], owners = [];
  let none = 0;
  for (const s of targets) {
    const subs = await subsOf(s);
    if (!subs.length) { none++; continue; }
    const url = new URL(`student.html?t=${s.token}${tab ? '#' + tab : ''}`, location.href).href;
    subs.forEach(sub => { messages.push({ sub: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, title, body, url, tag }); owners.push({ s, sub }); });
  }
  let sent = 0, failed = 0;
  if (messages.length) {
    try {
      const token = await auth.currentUser.getIdToken();
      for (let i = 0; i < messages.length; i += 40) {
        const res = await fetch(PUSH_WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ messages: messages.slice(i, i + 40) }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Push worker error');
        for (const r of data.results) {
          const o = owners[i + r.i];
          if (r.status >= 200 && r.status < 300) sent++;
          else {
            failed++;
            if (r.status === 404 || r.status === 410) await deleteDoc(doc(db, 'studentViews', o.s.token, 'push', o.sub.id)).catch(() => {});   // device unsubscribed
          }
        }
      }
    } catch (e) { console.error(e); if (!quiet) toast('Push failed: ' + e.message, 'err', 5000); return { sent, failed: messages.length - sent, none };
    }
  }
  if (!quiet) toast(sent ? `🔔 Notified ${sent} device${sent > 1 ? 's' : ''}${none ? ` · ${none} student${none > 1 ? 's' : ''} haven't enabled notifications` : ''}` : none ? 'No notification sent: students have not turned notifications on yet' : 'Notification could not be delivered', sent ? 'ok' : 'err', 4500);
  return { sent, failed, none };
}
