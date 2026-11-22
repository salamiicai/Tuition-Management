// Public student registration form. Writes ONE create-only document to `joinRequests`;
// the teacher reviews it in the dashboard before anything becomes a real student.
import { db, doc, getDoc, collection, addDoc, serverTimestamp } from './firebase.js';
import { esc, sanitizePhone } from './utils.js';
import { CLASSES } from './nano.js';

const root = document.getElementById('root');

async function main() {
  let t = {};
  try { const d = await getDoc(doc(db, 'public', 'teacher')); t = d.exists() ? d.data() : {}; } catch { /* handled below */ }
  const head = `<div class="hero" style="padding-bottom:60px"><div class="inner"><p>${esc(t.bio || 'Home tutoring')}</p><h1>${esc(t.name || 'Join my classes')}</h1><p>Student registration</p></div></div>`;
  if (!t.joinOpen) {
    root.innerHTML = head + `<div class="spage" style="max-width:560px"><div class="card empty"><div class="orb"><i class="fas fa-door-closed"></i></div>Registration is not open right now.<br>Please contact your teacher.</div></div>`;
    return;
  }
  root.innerHTML = head + `
  <div class="spage" style="max-width:560px"><form class="card view-in" id="f" novalidate>
    <h3>Tell me about yourself</h3>
    <label>Full name</label><input id="name" maxlength="80" autocomplete="name" required>
    <label>Class</label><select id="cls" required><option value="">Select class…</option>${CLASSES.map(c => `<option value="${c[0]}">${esc(c[1])}</option>`).join('')}</select>
    <label>School / College</label><input id="school" maxlength="100" required>
    <label>Guardian's WhatsApp number</label><input id="g" inputmode="tel" placeholder="01XXXXXXXXX" required>
    <div class="muted" style="margin-top:6px">📱 Please give a number your guardian uses on WhatsApp. All updates will be sent to this inbox: class attendance, monthly summaries, study materials, exam results and your private dashboard link.</div>
    <label>Your own WhatsApp number <span style="font-weight:500">(optional)</span></label><input id="w" inputmode="tel" placeholder="01XXXXXXXXX">
    <div id="err" class="alert alert-err hidden"></div>
    <button class="btn btn-primary btn-block" id="go" style="margin-top:16px" type="submit">Send request</button>
    <div class="muted" style="margin-top:10px;text-align:center">Your teacher will review it and confirm.</div>
  </form></div>`;
  const $ = id => document.getElementById(id);
  const showErr = m => { $('err').textContent = m; $('err').classList.remove('hidden'); };
  $('f').onsubmit = async e => {
    e.preventDefault();
    const name = $('name').value.trim(), cls = $('cls').value, school = $('school').value.trim();
    const g = sanitizePhone($('g').value), w = $('w').value.trim() ? sanitizePhone($('w').value) : '';
    if (!name) return showErr('Please enter your name.');
    if (!cls) return showErr('Please choose your class.');
    if (!school) return showErr('Please enter your school or college.');
    if (!g) return showErr("Guardian's WhatsApp number looks invalid.");
    if ($('w').value.trim() && !w) return showErr('Your WhatsApp number looks invalid.');
    $('go').disabled = true;
    try {
      await addDoc(collection(db, 'joinRequests'), { name, className: cls, school, guardianNumber: g, waStudent: w, status: 'pending', submittedAt: serverTimestamp() });
      root.innerHTML = head + `<div class="spage" style="max-width:560px"><div class="card empty view-in"><div class="orb" style="border-style:solid;background:var(--soft)"><i class="fas fa-check"></i></div><h3>Request sent!</h3>Thank you, ${esc(name.split(' ')[0])}. Your teacher will check your details and add you shortly. Updates will come on your guardian's WhatsApp.</div></div>`;
    } catch (err) {
      console.error(err); $('go').disabled = false;
      showErr('Could not send. Please check your internet and try again.');
    }
  };
}
main().catch(e => { console.error(e); root.innerHTML = '<div class="center-wrap"><div class="card">Could not load the form.</div></div>'; });
