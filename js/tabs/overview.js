import { store } from '../store.js';
import { esc, fmtYMD } from '../utils.js';
import { ringSvg, countUp } from '../fx.js';

export async function mount(el) {
  const h = new Date().getHours();
  const hi = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const rows = store.students.map(s => {
    const a = s.attendance || {};
    const m = (a.months || []).find(x => x.monthNumber === a.currentMonthNumber);
    return { s, m };
  });
  el.innerHTML = `
    <div><h2>${hi}${store.teacher.name ? ', ' + esc(store.teacher.name.split(' ')[0]) : ''} 👋</h2>
      <div class="muted">Here's how your students are doing this month.</div></div>
    <div class="grid" style="margin-top:6px">
      <div class="card"><div class="muted">Students</div><div class="stat" data-count="${store.students.length}">0</div></div>
      <div class="card"><div class="muted">Materials shared</div><div class="stat" data-count="${store.materials.length}">0</div></div>
    </div>
    <div class="row" style="margin-top:4px">
      <a class="btn btn-primary" href="#attendance"><i class="fas fa-plus"></i> Add class day</a>
      <a class="btn" href="#materials"><i class="fas fa-book-open"></i> Add material</a>
      <a class="btn" href="#students"><i class="fas fa-paper-plane"></i> Send link</a>
    </div>
    <h3 style="margin-top:6px">This month</h3>
    <div class="grid stagger">${rows.length ? rows.map(({ s, m }) => `
      <a href="#attendance" class="card hover" style="text-decoration:none;color:inherit">
        <div class="row" style="flex-wrap:nowrap">
          ${ringSvg({ value: m ? m.days.length : 0, max: Math.max(12, m ? m.days.length : 0), size: 66, stroke: 7, center: `<span style="font-size:1.15rem">${m ? m.days.length : '–'}</span>` })}
          <div style="min-width:0"><div class="title">${esc(s.name)}</div>
            <div class="muted">${esc(s.className)}</div>
            ${m ? `<span class="chip ok">Month ${m.monthNumber} · since ${fmtYMD(m.startDate)}</span>` : '<span class="chip warn">No active month</span>'}</div>
        </div></a>`).join('')
      : `<div class="card empty" style="grid-column:1/-1"><div class="orb"><i class="fas fa-atom"></i></div>No students yet.<br>Add your first one in the Students tab.</div>`}</div>`;
  countUp(el);
}
