import { db, doc, updateDoc } from '../firebase.js';
import { store, studentLink, templateText } from '../store.js';
import { openModal, confirmDialog, toast, sendWhatsApp } from '../ui.js';
import { esc, todayYMD, isValidYMD, fmtYMD, listDates } from '../utils.js';
import { syncStudentView } from '../viewsync.js';
import { ringSvg, confetti } from '../fx.js';

export async function mount(el) {
  let sel = store.students[0]?.id || '';
  const cur = () => store.students.find(s => s.id === sel);

  async function save(s, att) {
    s.attendance = att;
    await updateDoc(doc(db, 'students', s.id), { attendance: att, updatedAt: new Date().toISOString() });
    await syncStudentView(s);
  }
  const msgVars = (s, m) => ({
    student: s.name, class: s.className, month: m.monthNumber, startDate: fmtYMD(m.startDate),
    endDate: fmtYMD(m.endDate), total: m.days.length, dates: listDates(m.days, fmtYMD), link: studentLink(s.token)
  });

  function draw() {
    if (!store.students.length) { el.innerHTML = '<h2>Attendance</h2><div class="card empty">Add a student first.</div>'; return; }
    const s = cur(); const a = s.attendance || { months: [] }; const months = [...(a.months || [])].sort((x, y) => y.monthNumber - x.monthNumber);
    el.innerHTML = `
      <h2>Classes</h2>
      <div class="card">
        <div class="row" style="flex-wrap:nowrap;gap:16px">
          ${(() => { const cm = months.find(x => x.monthNumber === a.currentMonthNumber); const n = cm ? cm.days.length : 0; return ringSvg({ value: n, max: Math.max(12, n), size: 96, stroke: 9, center: cm ? n : '–', sub: cm ? 'classes' : 'no month' }); })()}
          <div style="flex:1;min-width:0"><label style="margin-top:0">Student</label>
        <select id="sel">${store.students.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        </div></div>
        <label>Date</label><input type="date" id="date" value="${todayYMD()}">
        <div class="row" style="margin-top:12px">
          <button class="btn btn-primary" id="addday" ${a.currentMonthNumber ? '' : 'disabled'}><i class="fas fa-plus"></i> Add class day</button>
          <button class="btn" id="start"><i class="fas fa-play"></i> Start month</button>
          ${a.currentMonthNumber ? '<button class="btn" id="end"><i class="fas fa-stop"></i> End month</button>' : ''}
        </div>
        ${a.currentMonthNumber ? '' : '<p class="muted" style="margin-top:8px">Start a month to begin adding class days.</p>'}
      </div>
      ${months.map(m => {
        const isCur = m.monthNumber === a.currentMonthNumber;
        return `<div class="card" style="margin-top:12px">
          <div class="row between"><h3>Month ${m.monthNumber}</h3><span class="chip ${isCur ? 'ok' : ''}">${isCur ? 'Current' : 'Ended'}</span></div>
          <div class="muted">Start ${fmtYMD(m.startDate)}${m.endDate ? ' · End ' + fmtYMD(m.endDate) : ''} · ${m.days.length} classes</div>
          <div class="cal">${m.days.map((d, i) => `<span class="day">${m.monthNumber}.${d.dayNumber} (${fmtYMD(d.date)})${isCur ? `<button data-rm="${i}" title="Remove">&times;</button>` : ''}</span>`).join('')}</div>
        </div>`;
      }).join('')}`;
  }
  draw();

  el.addEventListener('change', e => { if (e.target.id === 'sel') { sel = e.target.value; draw(); } });
  el.addEventListener('click', async e => {
    const s = cur(); if (!s) return;
    const a = JSON.parse(JSON.stringify(s.attendance || { currentMonthNumber: null, currentMonthStartDate: null, months: [] }));
    const date = el.querySelector('#date')?.value;
    const rm = e.target.closest('[data-rm]');
    try {
      if (rm) {
        const m = a.months.find(x => x.monthNumber === a.currentMonthNumber);
        const d = m.days[+rm.dataset.rm];
        if (!await confirmDialog(`Remove class day ${fmtYMD(d.date)}?`, { danger: true, okLabel: 'Remove' })) return;
        m.days.splice(+rm.dataset.rm, 1); m.days.forEach((x, i) => x.dayNumber = i + 1);
        await save(s, a); draw(); return;
      }
      if (e.target.closest('#addday')) {
        if (!isValidYMD(date)) return toast('Pick a valid date', 'err');
        let m = a.months.find(x => x.monthNumber === a.currentMonthNumber);
        if (!m) { m = { monthNumber: a.currentMonthNumber, startDate: a.currentMonthStartDate, endDate: null, endedAt: null, days: [] }; a.months.push(m); }
        if (m.days.some(d => d.date === date) && !await confirmDialog(`${fmtYMD(date)} is already added. Add another entry?`)) return;
        m.days.push({ dayNumber: m.days.length + 1, date, addedAt: new Date().toISOString() });
        await save(s, a); draw(); toast('Class day added'); return;
      }
      if (e.target.closest('#start')) {
        if (!isValidYMD(date)) return toast('Pick a valid start date', 'err');
        if (a.currentMonthNumber) return toast(`Month ${a.currentMonthNumber} is still active. End it first.`, 'err');
        const next = a.months.length ? Math.max(...a.months.map(x => x.monthNumber)) + 1 : 1;
        const m = openModal({
          title: 'Start new month', body: `<label>Month number</label><input id="mn" type="number" min="1" value="${next}">
            <p class="muted">Start date: ${fmtYMD(date)}</p>`,
          actions: [{ label: 'Cancel' }, { label: 'Start & send WhatsApp', cls: 'btn-primary', onClick: async ctx => {
            const n = parseInt(ctx.el.querySelector('#mn').value, 10);
            if (!n || n < 1) throw new Error('Enter a valid month number');
            if (a.months.some(x => x.monthNumber === n)) throw new Error('That month number already exists');
            const nm = { monthNumber: n, startDate: date, endDate: null, endedAt: null, days: [] };
            a.months.push(nm); a.currentMonthNumber = n; a.currentMonthStartDate = date;
            await save(s, a); draw();
            if (s.guardianNumber) sendWhatsApp(s.guardianNumber, templateText('monthStart', msgVars(s, nm)));
          } }]
        });
        return;
      }
      if (e.target.closest('#end')) {
        if (!isValidYMD(date)) return toast('Pick a valid end date', 'err');
        if (!await confirmDialog(`End Month ${a.currentMonthNumber} on ${fmtYMD(date)}?`)) return;
        const m = a.months.find(x => x.monthNumber === a.currentMonthNumber);
        m.endDate = date; m.endedAt = new Date().toISOString();
        a.currentMonthNumber = null; a.currentMonthStartDate = null;
        await save(s, a); draw(); confetti();
        if (s.guardianNumber) sendWhatsApp(s.guardianNumber, templateText('monthEnd', msgVars(s, m)));
      }
    } catch (err) { console.error(err); toast(err.message, 'err', 5000); }
  });
}
