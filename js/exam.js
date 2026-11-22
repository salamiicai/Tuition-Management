// Student Nano exam runner. First attempt earns credits (saved once); retakes are practice only.
import { db, doc, getDoc, setDoc, serverTimestamp } from './firebase.js';
import { esc, isValidToken } from './utils.js';
import { richHtml, imgHtml } from './math.js';
import { gradeQuestion, isAnswered, shuffle, TYPES } from './nano.js';
import { ringSvg, confetti, countUp } from './fx.js';

const root = document.getElementById('root');
const P = new URLSearchParams(location.search);
const token = P.get('t'), examId = P.get('e');
const back = `student.html?t=${encodeURIComponent(token || '')}`;

const fail = msg => { root.innerHTML = `<div class="center-wrap"><div class="card login-card" style="text-align:center"><div class="logo"><i class="fas fa-triangle-exclamation"></i></div><h3>${esc(msg)}</h3><a class="btn" href="${esc(back)}">Back to dashboard</a></div></div>`; };

async function main() {
  if (!isValidToken(token) || !/^[A-Za-z0-9]{8,40}$/.test(examId || '')) return fail('This exam link is not valid');
  const [ex, at] = await Promise.all([getDoc(doc(db, 'studentViews', token, 'nano', examId)), getDoc(doc(db, 'studentViews', token, 'attempts', examId))]);
  if (!ex.exists()) return fail('This exam is not available');
  const exam = ex.data(), already = at.exists() ? at.data() : null;
  document.title = exam.title;

  // ---- intro ----
  const intro = () => {
    root.innerHTML = `<div class="hero" style="padding-bottom:70px"><div class="inner"><p>Nano exam</p><h1>${esc(exam.title)}</h1></div></div>
      <div class="spage"><div class="card view-in" style="text-align:center">
        <div class="two" style="margin-bottom:14px"><div><div class="stat">${exam.total}</div><div class="muted">questions</div></div><div><div class="stat">${exam.totalMinutes}</div><div class="muted">minutes</div></div></div>
        ${already ? `<div class="alert alert-warn">You already did this exam (${already.correct}/${already.total} correct, +${already.creditsEarned} ⭐). This run is <b>practice</b>, no credits.</div>`
          : `<div class="alert" style="background:var(--soft);color:var(--brand)">⭐ Earn <b>${exam.points}</b> credit${exam.points === 1 ? '' : 's'} for each correct answer (up to ${exam.maxCredits}).${exam.penalty ? ` Each wrong answer costs ${exam.penalty}.` : ''}<br>Only your <b>first</b> attempt counts.</div>`}
        <button class="btn btn-primary btn-block" id="start" style="margin-top:12px">${already ? 'Start practice' : 'Start exam'}</button>
        <a class="btn btn-block" href="${esc(back)}" style="margin-top:10px">Back</a></div></div>`;
    document.getElementById('start').onclick = () => run(!already);
  };

  // ---- run ----
  function run(scored) {
    const order = shuffle(exam.questions.map((_, i) => i));
    const view = order.map(i => {
      const q = exam.questions[i];
      return { q, optOrder: q.type === 'mcq' ? shuffle(q.options.map((_, k) => k)) : null,
        rightOrder: q.type === 'match' ? shuffle(q.pairs.map((_, k) => k)) : null,
        itemOrder: q.type === 'order' ? shuffle(q.items.map((_, k) => k)) : null };
    });
    const resp = view.map(v => v.q.type === 'match' ? v.q.pairs.map(() => null) : v.q.type === 'order' ? [] : null);
    let cur = 0, left = exam.totalMinutes * 60, timer = null, finished = false;

    const qHtml = () => {
      const v = view[cur], q = v.q, r = resp[cur];
      let body = `<div class="${q.version} q-text" style="font-size:1.1rem;font-weight:600">${richHtml(q.q)}</div>${imgHtml(q.qImage)}<div class="muted" style="margin:4px 0 10px">${TYPES[q.type]}</div>`;
      if (q.type === 'mcq') body += v.optOrder.map(k => `<button class="opt ${r === k ? 'sel' : ''}" data-opt="${k}"><b>${String.fromCharCode(65 + v.optOrder.indexOf(k))}</b><span class="${q.version}">${richHtml(q.options[k])}</span></button>`).join('');
      if (q.type === 'tf') body += `<div class="two"><button class="opt ${r === true ? 'sel' : ''}" data-tf="1">True</button><button class="opt ${r === false ? 'sel' : ''}" data-tf="0">False</button></div>`;
      if (q.type === 'fill') body += `<input id="fill" class="${q.version}" placeholder="Type your answer" value="${esc(r || '')}" autocomplete="off">`;
      if (q.type === 'match') body += q.pairs.map((p, i) => `<div class="match-row"><div class="${q.version}">${richHtml(p.l)}</div><select data-m="${i}"><option value="">Choose…</option>${v.rightOrder.map(k => `<option value="${k}" ${r[i] === k ? 'selected' : ''}>${esc(q.pairs[k].r)}</option>`).join('')}</select></div>`).join('');
      if (q.type === 'order') body += `<div class="muted">Tap items in the correct order.</div><div class="ord-sel">${r.map((k, n) => `<button class="opt sel" data-un="${n}"><b>${n + 1}</b><span>${richHtml(q.items[k])}</span></button>`).join('') || '<div class="muted">Your order appears here</div>'}</div>
        <div class="ord-pool">${v.itemOrder.filter(k => !r.includes(k)).map(k => `<button class="opt" data-it="${k}"><span>${richHtml(q.items[k])}</span></button>`).join('')}</div>`;
      return body;
    };
    const mm = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const draw = () => {
      const answered = view.filter((v, i) => isAnswered(v.q, resp[i])).length;
      root.innerHTML = `<div class="exam-top"><div class="row between"><b>${cur + 1} / ${view.length}</b>
        <div class="timer ${left < 60 ? 'danger' : ''}" id="tm">⏱ ${mm(left)}</div></div>
        <div class="progress" style="margin-top:8px"><div style="width:${answered / view.length * 100}%"></div></div></div>
        <div class="spage" style="margin-top:14px"><div class="card view-in" id="qcard">${qHtml()}</div>
        <div class="dots" style="margin:12px 0">${view.map((v, i) => `<button class="qdot ${i === cur ? 'cur' : ''} ${isAnswered(v.q, resp[i]) ? 'done' : ''}" data-go="${i}">${i + 1}</button>`).join('')}</div>
        <div class="row between"><button class="btn" id="prev" ${cur === 0 ? 'disabled' : ''}>← Back</button>
          ${cur === view.length - 1 ? '<button class="btn btn-primary" id="submit">Submit</button>' : '<button class="btn btn-primary" id="next">Next →</button>'}</div></div>`;
    };
    draw();
    timer = setInterval(() => {
      left--; const t = document.getElementById('tm');
      if (t) { t.textContent = '⏱ ' + mm(Math.max(0, left)); t.classList.toggle('danger', left < 60); }
      if (left <= 0) finish(true);
    }, 1000);

    root.onclick = e => {
      if (finished) return;
      const q = view[cur].q, set = v => { resp[cur] = v; draw(); };
      const g = e.target.closest('[data-go]'); if (g) { cur = +g.dataset.go; return draw(); }
      if (e.target.closest('#prev')) { cur--; return draw(); }
      if (e.target.closest('#next')) { cur++; return draw(); }
      if (e.target.closest('#submit')) {
        const un = view.filter((v, i) => !isAnswered(v.q, resp[i])).length;
        if (un && !confirm(`${un} question${un > 1 ? 's are' : ' is'} unanswered. Submit anyway?`)) return;
        return finish(false);
      }
      const o = e.target.closest('[data-opt]'); if (o) return set(+o.dataset.opt);
      const tf = e.target.closest('[data-tf]'); if (tf) return set(tf.dataset.tf === '1');
      const it = e.target.closest('[data-it]'); if (it) return set([...resp[cur], +it.dataset.it]);
      const un = e.target.closest('[data-un]'); if (un) return set(resp[cur].slice(0, +un.dataset.un));
    };
    root.oninput = e => { if (e.target.id === 'fill') resp[cur] = e.target.value; };
    root.onchange = e => {
      if (e.target.dataset.m !== undefined) { resp[cur] = resp[cur].slice(); resp[cur][+e.target.dataset.m] = e.target.value === '' ? null : +e.target.value; draw(); }
    };

    async function finish(timeUp) {
      if (finished) return; finished = true; clearInterval(timer);
      let correct = 0, wrong = 0; const wrongIds = [];
      view.forEach((v, i) => {
        if (!isAnswered(v.q, resp[i])) return;
        if (gradeQuestion(v.q, resp[i])) correct++; else { wrong++; wrongIds.push(v.q.id); }
      });
      const earned = Math.min(exam.maxCredits, Math.max(0, correct * exam.points - wrong * (exam.penalty || 0)));
      let saved = false, saveErr = '';
      if (scored) {
        try {
          await setDoc(doc(db, 'studentViews', token, 'attempts', examId), {
            examId, examTitle: exam.title, correct, wrong, total: exam.total, creditsEarned: earned, wrongIds: wrongIds.slice(0, 100), submittedAt: serverTimestamp()
          });
          saved = true;
        } catch (err) { console.error(err); saveErr = 'Your result could not be saved (maybe you already submitted this exam).'; }
      }
      result({ correct, wrong, earned, saved, saveErr, timeUp });
    }

    function result({ correct, wrong, earned, saved, saveErr, timeUp }) {
      const pct = Math.round(correct / exam.total * 100);
      root.innerHTML = `<div class="hero" style="padding-bottom:70px"><div class="inner"><p>${timeUp ? "Time's up" : 'Finished'}</p><h1>${esc(exam.title)}</h1></div></div>
        <div class="spage"><div class="card ringcard view-in">
          ${ringSvg({ value: correct, max: exam.total, size: 170, stroke: 14, center: `${correct}/${exam.total}`, sub: pct + '% CORRECT' })}
          <div style="margin-top:14px">${saved ? `<span class="chip ok" style="font-size:1rem">+${earned} ⭐ credits earned</span>` : scored ? `<div class="alert alert-warn">${esc(saveErr || 'Not saved')}</div>` : '<span class="chip">Practice run · no credits</span>'}</div>
          <div class="muted" style="margin-top:8px">${wrong} wrong · ${exam.total - correct - wrong} skipped</div></div>
        <h3 style="margin:18px 4px 8px">Review</h3><div class="stack stagger">${view.map((v, i) => review(v, i)).join('')}</div>
        <a class="btn btn-primary btn-block" href="${esc(back)}">Back to dashboard</a></div>`;
      if (pct >= 70) confetti();
    }
    function review(v, i) {
      const q = v.q, ok = gradeQuestion(q, resp[i]), ans = isAnswered(q, resp[i]);
      let correctText = '';
      if (q.type === 'mcq') correctText = richHtml(q.options[q.answer]);
      else if (q.type === 'tf') correctText = q.answer ? 'True' : 'False';
      else if (q.type === 'fill') correctText = esc(q.answer.join(' / '));
      else if (q.type === 'match') correctText = q.pairs.map(p => `${richHtml(p.l)} ↔ ${esc(p.r)}`).join('<br>');
      else correctText = q.items.map((x, n) => `${n + 1}. ${richHtml(x)}`).join('<br>');
      return `<div class="card"><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><div class="${q.version}">${richHtml(q.q)}${imgHtml(q.qImage)}</div>
        <span class="chip ${ok ? 'ok' : ans ? 'warn' : ''}">${ok ? '✓' : ans ? '✗' : 'skipped'}</span></div>
        ${ok ? '' : `<div class="alert" style="background:rgba(52,211,153,.14);color:var(--okd)"><b>Correct:</b> ${correctText}</div>`}
        ${q.explain || q.explainImage ? `<div class="muted ${q.version}">💡 ${richHtml(q.explain)}${imgHtml(q.explainImage)}</div>` : ''}</div>`;
    }
  }
  intro();
}
main().catch(e => { console.error(e); fail('Could not load the exam'); });
