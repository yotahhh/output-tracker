// View renderers. Each one receives the <main> element and fills it.
import { store, exportBackup, importBackup, defaultState, uid, KEY } from './store.js';
import * as D from './dates.js';
import * as L from './logic.js';
import { openWarmup } from './timer.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root) => root.querySelector(sel);
const $$ = (sel, root) => [...root.querySelectorAll(sel)];
const save = () => store.save();

function rerender(keepScroll = true) {
  const y = window.scrollY;
  window.dispatchEvent(new Event('app:render'));
  if (keepScroll) window.scrollTo(0, y);
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2000);
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#eef1f5' : '#131922');
}

const banner = (kind, text, extra = '') => `<div class="banner ${kind}"><p>${text}</p>${extra}</div>`;
const pageHead = (title, sub = '') => `<header class="page-head"><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</header>`;
const backLink = '<a class="back" href="#/more"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>More</a>';
const quickLog = (type, placeholder) => `
  <form class="inline-form" data-quick="${type}">
    <input name="text" required placeholder="${placeholder}" autocomplete="off" aria-label="${placeholder}">
    <button class="btn primary">Log</button>
  </form>`;

function addLog(type, text, date) {
  store.state.shipLog.push({ id: uid(), type, text: text.trim(), date });
  save();
}

function bindQuickLogs(el, today) {
  $$('form[data-quick]', el).forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const text = f.elements.text.value.trim();
    if (!text) return;
    addLog(f.dataset.quick, text, today);
    toast(f.dataset.quick === 'post' ? 'Post logged' : 'Shipped. Nice.');
    rerender();
  }));
}

/* ---------- Today ---------- */

export function renderToday(el) {
  const s = store.state;
  const today = D.todayISO();
  const day = L.getDay(s, today);
  const floors = L.floorsFor(today);
  const idx = D.dayIndex(today);
  const dw = D.dow(today);
  const hour = new Date().getHours();
  const st = L.streakInfo(s, today);
  const warm = L.warmupsThisWeek(s, today);
  const microToday = L.getDay(s, D.addDays(today, -1)).microTaskTomorrow;
  const track = s.tracks.active;
  const banners = [];
  const alerts = [];

  if (idx < 0) banners.push(banner('info', `The 12 weeks start on ${D.fmtLong(D.START)}.`));
  if (idx >= D.TOTAL_DAYS) {
    banners.push(banner('info', 'The 12 weeks are done. Time for the big review.', '<a class="btn small" href="#/review">Open review</a>'));
  }

  if (!st.todayDone && st.broken && idx > 1) {
    alerts.push(banner('warn', 'Two days missed. No drama, start a fresh chain today.'));
  } else if (!st.todayDone && st.yesterdayMissed) {
    alerts.push(banner('accent', '<strong>Yesterday was missed.</strong> Today keeps the chain alive.'));
  }

  // Sun and Mon evenings: gentle hard stop reminder.
  if ((dw === 6 || dw === 0) && (hour >= 20 || hour < D.ROLLOVER_HOUR)) {
    const late = hour >= 23 || hour < D.ROLLOVER_HOUR;
    alerts.push(banner('calm', late
      ? '<strong>It is past 23:00.</strong> Hard stop. Tomorrow is a protection day, rest counts too.'
      : '<strong>Hard stop 23:00 tonight.</strong> Tomorrow is a protection day.'));
  }

  if (s.defaults.postingDays.includes(dw)) {
    const posted = s.shipLog.filter(e => e.type === 'post' && e.date === today);
    const lastReview = s.reviews[D.addDays(D.weekStart(today), -1)];
    const planned = lastReview && (dw === 2 ? lastReview.postWed : dw === 5 ? lastReview.postSat : '');
    let text = '<strong>Posting day.</strong>';
    if (planned) text += ` Planned on Sunday: ${esc(planned)}`;
    const extra = posted.length
      ? `<p class="done-line">Posted: ${posted.map(p => esc(p.text)).join(', ')}</p>`
      : quickLog('post', 'What did you post?');
    banners.push(banner('accent', text, extra));
  }

  if (dw === 6) {
    if (!L.logThisWeek(s, today, 'ship').length) {
      banners.push(banner('warn', 'Nothing shipped this week yet. A loop, a sketch or a 30 s clip counts.', quickLog('ship', 'What did you ship?')));
    }
    const reviewed = s.reviews[today];
    banners.push(banner('info', reviewed ? 'Sunday review saved.' : '<strong>Sunday.</strong> Time for the weekly review.',
      `<a class="btn small" href="#/review">${reviewed ? 'View review' : 'Start review'}</a>`));
  }

  if (track && L.trackStatus(track, today).left <= 0) {
    banners.push(banner('accent', `<strong>${esc(track.name)}</strong> hit 3 weeks. Export it as it is and start the next one.`,
      '<a class="btn small" href="#/track">Open track</a>'));
  }

  if (warm.ignored >= 3) {
    banners.push(banner('warn', `Timer ignored ${warm.ignored} times this week. Consider swapping the warm-up for something that fits better.`));
  }

  const checks = L.TASKS.map(t => `
    <li><label class="check">
      <input type="checkbox" data-key="${t.key}" ${day[t.key] ? 'checked' : ''}>
      <span class="box" aria-hidden="true"></span>
      <span class="check-text"><span class="check-label">${t.label}</span><span class="floor">${floors[t.key]}</span></span>
    </label></li>`).join('');

  let trackLine = '<a class="track-line" href="#/track"><span class="muted">No active track.</span><strong>Start one</strong></a>';
  if (track) {
    const ts = L.trackStatus(track, today);
    trackLine = `<a class="track-line" href="#/track"><span class="muted">Track</span><strong>${esc(track.name)}</strong>
      <span class="pill">${ts.left > 0 ? `${ts.left} d left` : 'Export now'}</span></a>`;
  }

  const weekLabel = D.inProgram(today) ? `W${D.weekNumber(today)} of 12` : 'Outside the 12 weeks';

  el.innerHTML = `
  <section class="stack">
    <header class="day-head">
      <div>
        <p class="eyebrow">${weekLabel}${L.isProtectionDay(today) ? ' · <span class="accent-text">Protection day</span>' : ''}</p>
        <h1>${D.fmtLong(today)}</h1>
      </div>
      <div class="streak${st.todayDone ? ' lit' : ''}" title="Best chain: ${st.best}">
        <span class="streak-num">${st.current}</span><span class="streak-label">day chain</span>
      </div>
    </header>
    ${alerts.join('')}
    ${microToday ? `<div class="card micro"><p class="eyebrow">Today's micro-task</p><p class="micro-text">${esc(microToday)}</p></div>` : ''}
    <ul class="checks">${checks}</ul>
    <label class="field"><span>Homework for Life</span>
      <textarea id="hfl" rows="2" placeholder="One or two sentences. Which moment from today is worth a story?">${esc(day.hflText)}</textarea>
    </label>
    <label class="field"><span>Tomorrow's micro-task</span>
      <input id="micro" type="text" value="${esc(day.microTaskTomorrow)}" placeholder="Small enough to start in 2 min" autocomplete="off">
    </label>
    ${banners.join('')}
    <div class="warm">
      <button class="btn primary big" id="warmup">${s.timer ? 'Warm-up running' : 'Start warm-up'}</button>
      <p class="muted small">This week: timer respected ${warm.respected}, ignored ${warm.ignored}</p>
    </div>
    ${trackLine}
  </section>`;

  $$('.checks input', el).forEach(cb => cb.addEventListener('change', () => {
    L.ensureDay(s, today)[cb.dataset.key] = cb.checked;
    save();
    rerender();
    if (cb.checked && L.isComplete(s, today)) toast('All four floors. The chain holds.');
  }));
  $('#hfl', el).addEventListener('input', e => { L.ensureDay(s, today).hflText = e.target.value; save(); });
  $('#micro', el).addEventListener('input', e => { L.ensureDay(s, today).microTaskTomorrow = e.target.value; save(); });
  $('#warmup', el).addEventListener('click', openWarmup);
  bindQuickLogs(el, today);
}

/* ---------- Timeline ---------- */

export function renderTimeline(el) {
  const s = store.state;
  const today = D.todayISO();
  const idx = D.dayIndex(today);
  const N = D.TOTAL_DAYS;
  const wk = D.weekNumber(today);
  const clampDay = d => Math.max(0, Math.min(N, d));
  const pct = d => `${(clampDay(d) / N * 100).toFixed(3)}%`;
  const clip = (a, b, label, cls) => {
    a = clampDay(a);
    b = clampDay(b);
    if (b <= a) return '';
    return `<div class="clip ${cls}" style="left:${pct(a)};width:${pct(b - a)}" title="${esc(label)}"><span>${esc(label)}</span></div>`;
  };
  const mark = (d, cls, title) => `<i class="${cls}" style="left:${pct(d + 0.5)}" title="${esc(title)}"></i>`;

  const weeks = Array.from({ length: 12 }, (_, i) =>
    `<div class="wk${i + 1 === wk ? ' cur' : ''}"><b>W${i + 1}</b><span>${D.fmt(D.addDays(D.START, i * 7))}</span></div>`).join('');

  const phases = L.PHASES.map((p, i) => clip(p.from, p.to, `${p.weeks} · ${p.label}`, `phase p${i}`)).join('');

  let tracks = s.tracks.finished.map(t =>
    clip(D.dayIndex(t.start), D.dayIndex(t.end) + 1, t.name, 'track done')).join('');
  if (s.tracks.active) {
    const a = D.dayIndex(s.tracks.active.start);
    tracks += clip(a, Math.max(idx + 1, a + 1), '', 'track live');
    tracks += clip(a, Math.max(a + L.TRACK_DAYS, idx + 1), s.tracks.active.name, 'track planned');
  }

  const ships = s.shipLog.filter(e => e.type === 'ship' && D.inProgram(e.date))
    .map(e => mark(D.dayIndex(e.date), 'diamond', `${D.fmt(e.date)}: ${e.text}`)).join('');
  const plannedPosts = D.programDays().map((d, i) =>
    s.defaults.postingDays.includes(D.dow(d)) ? mark(i, 'dot planned', `${D.fmtLong(d)}: posting day`) : '').join('');
  const posts = s.shipLog.filter(e => e.type === 'post' && D.inProgram(e.date))
    .map(e => mark(D.dayIndex(e.date), 'dot done', `${D.fmt(e.date)}: ${e.text}`)).join('');
  const flags = L.CHECKPOINTS.map(c =>
    `<div class="flag${c.day >= N ? ' end' : ''}${today > c.date ? ' past' : ''}" style="left:${pct(c.day)}"><span>${esc(c.label)}</span></div>`).join('');

  const now = idx >= 0 && idx < N
    ? `<div class="curweek" style="--a:${((wk - 1) / 12).toFixed(4)}"></div><div class="playhead" style="--a:${((idx + 0.5) / N).toFixed(4)}"></div>`
    : '';

  const cps = L.CHECKPOINTS.map(c => {
    const dd = D.diffDays(today, c.date);
    const when = dd > 1 ? `in ${dd} days` : dd === 1 ? 'tomorrow' : dd === 0 ? 'today' : 'passed';
    return `<li class="${dd < 0 ? 'past' : ''}"><span class="cp-date">${D.fmtLong(c.date)}</span><span class="cp-label">${c.label}</span><span class="muted small">${c.detail}, ${when}</span></li>`;
  }).join('');

  const phase = L.PHASES.find(p => idx >= p.from && idx < p.to);

  el.innerHTML = `
  ${pageHead('12 weeks', `${D.fmt(D.START)} to ${D.fmt(D.END)}${D.inProgram(today) ? ` · Week ${wk} of 12 · ${phase.label}` : ''}`)}
  <div class="arr-scroll" tabindex="0" aria-label="Arrangement timeline, scroll sideways">
    <div class="arr">
      <div class="arr-row head"><div class="lane-name"></div><div class="lane weeks">${weeks}</div></div>
      <div class="arr-row"><div class="lane-name">Phase</div><div class="lane">${phases}</div></div>
      <div class="arr-row"><div class="lane-name">Tracks</div><div class="lane">${tracks}</div></div>
      <div class="arr-row"><div class="lane-name">Shipped</div><div class="lane">${ships}</div></div>
      <div class="arr-row"><div class="lane-name">Posting</div><div class="lane">${plannedPosts}${posts}</div></div>
      <div class="arr-row"><div class="lane-name">Checkpoints</div><div class="lane">${flags}</div></div>
      ${now}
    </div>
  </div>
  <ul class="legend">
    <li><i class="lg-live"></i>Active track</li>
    <li><i class="lg-planned"></i>3-week window</li>
    <li><i class="diamond static"></i>Shipped</li>
    <li><i class="dot planned static"></i>Posting day</li>
    <li><i class="dot done static"></i>Posted</li>
  </ul>
  <section class="card stack">
    <h2>Checkpoints</h2>
    <ul class="cp-list">${cps}</ul>
  </section>`;

  // Start the scroll near the current week on narrow screens.
  const sc = $('.arr-scroll', el);
  if (idx > 0 && sc.scrollWidth > sc.clientWidth) {
    sc.scrollLeft = Math.max(0, (idx / N) * sc.scrollWidth - sc.clientWidth / 2);
  }
}

/* ---------- Sunday review ---------- */

let reviewAnyway = false;

export function renderReview(el) {
  const s = store.state;
  const today = D.todayISO();
  const sunday = D.weekEnd(today);
  const existing = s.reviews[sunday];
  const showForm = D.dow(today) === 6 || reviewAnyway || existing;
  const days = D.weekDays(today);
  const elapsed = days.filter(d => d <= today);
  const floorCounts = Object.fromEntries(L.TASKS.map(t => [t.key, elapsed.filter(d => L.getDay(s, d)[t.key]).length]));
  const ships = L.logThisWeek(s, today, 'ship');
  const posts = L.logThisWeek(s, today, 'post');
  const r = existing || { made: '', floors: '', track: s.tracks.active?.name || '', microTasks: ['', '', ''], postWed: '', postSat: '' };

  const hfl = days.filter(d => L.getDay(s, d).hflText?.trim())
    .map(d => `<li><span class="muted small">${D.fmtLong(d)}</span><p>${esc(L.getDay(s, d).hflText)}</p></li>`).join('')
    || '<li class="muted">No entries yet this week.</li>';

  const floorPills = L.TASKS.map(t => `<span class="pill">${t.label} ${floorCounts[t.key]}/${elapsed.length}</span>`).join('');

  const form = showForm ? `
    <form id="review" class="card stack">
      <label class="field"><span>What did I make and ship?</span>
        <textarea name="made" rows="3">${esc(r.made)}</textarea></label>
      ${ships.length || posts.length ? `<p class="muted small">Logged this week: ${[...ships, ...posts].map(e => esc(e.text)).join(', ')}</p>` : ''}
      <div class="field"><span>Which floors held?</span>
        <div class="pills">${floorPills}</div>
        <textarea name="floors" rows="2" placeholder="What helped, what broke">${esc(r.floors)}</textarea></div>
      <label class="field"><span>Active track</span>
        <input name="track" value="${esc(r.track)}" autocomplete="off"></label>
      <fieldset class="field"><legend>Next three micro-tasks</legend>
        ${[0, 1, 2].map(i => `<input name="mt${i}" value="${esc(r.microTasks?.[i])}" placeholder="${i + 1}." aria-label="Micro-task ${i + 1}" autocomplete="off">`).join('')}
        <p class="muted small">The first one becomes tomorrow's micro-task if that is still empty.</p>
      </fieldset>
      <fieldset class="field"><legend>What will I post?</legend>
        <input name="postWed" value="${esc(r.postWed)}" placeholder="Wed" aria-label="Post on Wed" autocomplete="off">
        <input name="postSat" value="${esc(r.postSat)}" placeholder="Sat" aria-label="Post on Sat" autocomplete="off">
      </fieldset>
      <button class="btn primary big">${existing ? 'Update review' : 'Save review'}</button>
    </form>` : `
    <div class="card stack">
      <p>Reviews open on Sundays. Next one: <strong>${D.fmtLong(sunday)}</strong>.</p>
      <button class="btn" id="review-anyway">Review this week now</button>
    </div>`;

  const row = (label, val) => val ? `<dt>${label}</dt><dd>${esc(val)}</dd>` : '';
  const pastKeys = Object.keys(s.reviews).filter(k => k !== sunday).sort().reverse();
  const past = pastKeys.map(k => {
    const p = s.reviews[k];
    const counts = p.floorCounts ? L.TASKS.map(t => `${t.label} ${p.floorCounts[t.key] ?? 0}`).join(', ') : '';
    const mts = (p.microTasks || []).filter(Boolean);
    return `<details class="card past">
      <summary><strong>${D.inProgram(k) ? `W${D.weekNumber(k)}` : 'Week'}</strong> <span class="muted">ending ${D.fmtLong(k)}</span></summary>
      <dl>
        ${row('Made and shipped', p.made)}
        ${row('Floors', [counts, p.floors].filter(Boolean).join('. '))}
        ${row('Active track', p.track)}
        ${mts.length ? `<dt>Micro-tasks</dt><dd><ol>${mts.map(m => `<li>${esc(m)}</li>`).join('')}</ol></dd>` : ''}
        ${row('Post Wed', p.postWed)}
        ${row('Post Sat', p.postSat)}
      </dl>
    </details>`;
  }).join('') || '<p class="muted">No past reviews yet.</p>';

  el.innerHTML = `
  ${pageHead('Sunday review', `Week ${D.inProgram(today) ? D.weekNumber(today) : ''} · ${D.fmt(days[0])} to ${D.fmt(sunday)}`)}
  <div class="review-grid">
    <div class="stack">${form}</div>
    <aside class="card stack">
      <h2>Homework for Life this week</h2>
      <p class="muted small">Pull titles and captions from these.</p>
      <ul class="hfl-list">${hfl}</ul>
    </aside>
  </div>
  <section class="stack past-list">
    <h2>Past reviews</h2>
    ${past}
  </section>`;

  $('#review-anyway', el)?.addEventListener('click', () => { reviewAnyway = true; rerender(); });
  $('#review', el)?.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const microTasks = [f.mt0.value.trim(), f.mt1.value.trim(), f.mt2.value.trim()];
    s.reviews[sunday] = {
      made: f.made.value.trim(),
      floors: f.floors.value.trim(),
      track: f.track.value.trim(),
      microTasks,
      postWed: f.postWed.value.trim(),
      postSat: f.postSat.value.trim(),
      floorCounts,
      savedAt: new Date().toISOString(),
    };
    const d = L.ensureDay(s, today);
    if (!d.microTaskTomorrow.trim() && microTasks[0]) d.microTaskTomorrow = microTasks[0];
    save();
    toast('Review saved');
    rerender();
  });
}

/* ---------- History ---------- */

let historySel = null;

export function renderHistory(el) {
  const s = store.state;
  const today = D.todayISO();
  const sel = historySel && D.inProgram(historySel) ? historySel : (D.inProgram(today) ? today : D.START);
  const st = L.streakInfo(s, today);
  const past = D.programDays().filter(d => d <= today);
  const complete = past.filter(d => L.isComplete(s, d)).length;

  let grid = `<div></div>${D.DAY_SHORT.map(n => `<div class="cal-h">${n}</div>`).join('')}`;
  for (let w = 0; w < 12; w++) {
    grid += `<div class="cal-w">W${w + 1}</div>`;
    for (let i = 0; i < 7; i++) {
      const d = D.addDays(D.START, w * 7 + i);
      const n = L.floorsHit(s, d);
      const cls = `cal-day lv${n}${d > today ? ' future' : ''}${d === today ? ' today' : ''}${d === sel ? ' sel' : ''}`;
      grid += `<button class="${cls}" data-date="${d}" aria-pressed="${d === sel}" aria-label="${D.fmtLong(d)}, ${n} of 4 floors">${+d.slice(8)}</button>`;
    }
  }

  const sd = L.getDay(s, sel);
  const fl = L.floorsFor(sel);
  const detailBody = sel > today ? '<p class="muted">Still ahead.</p>' : `
    <ul class="checks compact">${L.TASKS.map(t => `
      <li><label class="check">
        <input type="checkbox" data-key="${t.key}" ${sd[t.key] ? 'checked' : ''}>
        <span class="box" aria-hidden="true"></span>
        <span class="check-text"><span class="check-label">${t.label}</span><span class="floor">${fl[t.key]}</span></span>
      </label></li>`).join('')}</ul>
    ${sd.hflText ? `<div><p class="eyebrow">Homework for Life</p><p>${esc(sd.hflText)}</p></div>` : ''}
    ${sd.microTaskTomorrow ? `<div><p class="eyebrow">Micro-task set for the next day</p><p>${esc(sd.microTaskTomorrow)}</p></div>` : ''}
    ${sd.warmups?.length ? `<p class="muted small">Warm-ups: ${sd.warmups.map(w => `${w.at} ${w.respected ? 'respected' : 'ignored'}`).join(', ')}</p>` : ''}
    <p class="muted small">Forgot to tick something? Fix it here.</p>`;

  el.innerHTML = `
  ${pageHead('History', `${complete} of ${past.length} days complete · chain ${st.current} · best ${st.best}`)}
  <div class="cal" role="group" aria-label="84 days">${grid}</div>
  <ul class="legend">
    ${[0, 1, 2, 3, 4].map(n => `<li><i class="sw lv${n}"></i>${n === 4 ? 'All 4' : n}</li>`).join('')}
  </ul>
  <section class="card stack">
    <div class="row between"><h2>${D.fmtLong(sel)}</h2><span class="pill">${L.floorsHit(s, sel)}/4</span></div>
    ${detailBody}
  </section>`;

  $$('.cal-day', el).forEach(b => b.addEventListener('click', () => { historySel = b.dataset.date; rerender(); }));
  $$('.checks input', el).forEach(cb => cb.addEventListener('change', () => {
    L.ensureDay(s, sel)[cb.dataset.key] = cb.checked;
    save();
    rerender();
  }));
}

/* ---------- More ---------- */

export function renderMore(el) {
  const s = store.state;
  const today = D.todayISO();
  const t = s.tracks.active;
  const trackSub = t ? `${esc(t.name)}, ${Math.max(0, L.trackStatus(t, today).left)} days left` : 'No active track';
  const ships = L.logThisWeek(s, today, 'ship').length;
  const posts = L.logThisWeek(s, today, 'post').length;
  const last = s.settings.lastExport ? new Date(s.settings.lastExport) : null;
  const stale = !last || (Date.now() - last) > 7 * 86400000;
  const items = [
    ['#/track', 'Active track', trackSub],
    ['#/energy', 'Energy menu', 'High, medium and low energy tasks'],
    ['#/log', 'Shipping and posting log', `This week: ${ships} shipped, ${posts} posts`],
    ['#/defaults', 'Defaults', 'Locked until 20.12.26'],
    ['#/backup', 'Backup', last ? `Last export ${D.fmt(D.toISO(last))} ${D.time24(last)}` : 'Never exported'],
  ];

  el.innerHTML = `
  ${pageHead('More')}
  ${stale ? banner('warn', 'Your data lives only in this browser. Export a backup now and then.', '<a class="btn small" href="#/backup">Backup</a>') : ''}
  <ul class="nav-list">
    ${items.map(([href, title, sub]) => `<li><a href="${href}"><span><strong>${title}</strong><span class="muted small">${sub}</span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></a></li>`).join('')}
  </ul>
  <div class="card row between">
    <div><strong>Theme</strong><p class="muted small">${s.settings.theme === 'light' ? 'Light' : 'Dark'}</p></div>
    <button class="btn" id="theme">Switch to ${s.settings.theme === 'light' ? 'dark' : 'light'}</button>
  </div>
  <p class="muted small center">The day rolls over at 04:00, so late sessions count for the evening before.</p>`;

  $('#theme', el).addEventListener('click', () => {
    s.settings.theme = s.settings.theme === 'light' ? 'dark' : 'light';
    save();
    applyTheme(s.settings.theme);
    rerender();
  });
}

/* ---------- Energy menu ---------- */

const lastPick = {};

export function renderEnergy(el) {
  const s = store.state;
  const levels = [['high', 'High energy'], ['medium', 'Medium energy'], ['low', 'Low energy']];

  el.innerHTML = `
  ${backLink}
  ${pageHead('Energy menu', 'Match the task to the tank. Let the app decide when deciding feels like work.')}
  ${levels.map(([k, label]) => `
    <section class="card stack energy e-${k}" data-level="${k}">
      <div class="row between"><h2><i class="level-dot"></i>${label}</h2><button class="btn small primary" data-pick>Pick one for me</button></div>
      <div class="pick-result" ${lastPick[k] ? '' : 'hidden'}>${esc(lastPick[k])}</div>
      <ul class="elist">${s.energy[k].map((t, i) => `
        <li><input value="${esc(t)}" data-i="${i}" aria-label="Task"><button class="icon-btn" data-del="${i}" aria-label="Remove task">×</button></li>`).join('')}
      </ul>
      <form class="inline-form" data-add>
        <input name="text" placeholder="Add a task" required autocomplete="off" aria-label="Add a ${label.toLowerCase()} task">
        <button class="btn">Add</button>
      </form>
    </section>`).join('')}`;

  $$('.energy', el).forEach(sec => {
    const k = sec.dataset.level;
    const list = s.energy[k];
    $('[data-pick]', sec).addEventListener('click', () => {
      if (!list.length) return toast('Add a task first');
      lastPick[k] = L.pickOne(list, lastPick[k]);
      const out = $('.pick-result', sec);
      out.textContent = lastPick[k];
      out.hidden = false;
      out.classList.remove('pop');
      void out.offsetWidth;
      out.classList.add('pop');
    });
    $$('input[data-i]', sec).forEach(inp => inp.addEventListener('change', () => {
      const v = inp.value.trim();
      if (v) list[+inp.dataset.i] = v;
      else list.splice(+inp.dataset.i, 1);
      save();
      if (!v) rerender();
    }));
    $$('[data-del]', sec).forEach(b => b.addEventListener('click', () => {
      list.splice(+b.dataset.del, 1);
      save();
      rerender();
    }));
    $('form[data-add]', sec).addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.elements.text.value.trim();
      if (!v) return;
      list.push(v);
      save();
      rerender();
      $(`.e-${k} form[data-add] input`, el)?.focus();
    });
  });
}

/* ---------- Active track ---------- */

export function renderTrack(el) {
  const s = store.state;
  const today = D.todayISO();
  const t = s.tracks.active;
  let main;

  if (t) {
    const ts = L.trackStatus(t, today);
    const done = ts.left <= 0;
    const progress = Math.min(100, Math.max(0, ts.day / L.TRACK_DAYS * 100));
    main = `
    <section class="card stack">
      <p class="eyebrow">Active track</p>
      <label class="field"><span>Name</span><input id="t-name" value="${esc(t.name)}" autocomplete="off"></label>
      <label class="field"><span>Start date (DD.MM.YY)</span><input id="t-start" value="${D.fmt(t.start)}" autocomplete="off"></label>
      <div class="count-block"><span class="big-num">${Math.max(0, ts.left)}</span><span class="muted">of 21 days left</span></div>
      <div class="bar${done ? ' full' : ''}"><i style="width:${progress.toFixed(1)}%"></i></div>
      <p class="muted small">Day ${Math.max(1, ts.day)} · last day ${D.fmtLong(ts.end)}</p>
      ${done ? banner('accent', '<strong>Time is up.</strong> Export it as it is and start the next one.') : ''}
      <button class="btn ${done ? 'primary ' : ''}big" id="t-finish">${done ? 'Exported, mark as finished' : 'Finish early, it is exported'}</button>
      <button class="btn ghost" id="t-drop">Discard without finishing</button>
    </section>`;
  } else {
    main = `
    <form id="t-new" class="card stack">
      <p class="eyebrow">Start a track</p>
      <label class="field"><span>Name</span><input name="name" required autocomplete="off" placeholder="Working title is fine"></label>
      <label class="field"><span>Start date (DD.MM.YY)</span><input name="start" value="${D.fmt(today)}" required autocomplete="off"></label>
      <button class="btn primary big">Start 3-week countdown</button>
    </form>`;
  }

  const finished = [...s.tracks.finished].reverse().map((f, i) => {
    const realIndex = s.tracks.finished.length - 1 - i;
    return `<li><span><strong>${esc(f.name)}</strong><span class="muted small">${D.fmt(f.start)} to ${D.fmt(f.end)} · ${D.diffDays(f.start, f.end) + 1} days</span></span>
      <button class="icon-btn" data-del="${realIndex}" aria-label="Delete ${esc(f.name)}">×</button></li>`;
  }).join('');

  el.innerHTML = `
  ${backLink}
  ${pageHead('Active track', 'One track at a time. Three weeks, then it goes out as it is.')}
  ${main}
  <section class="stack">
    <h2>Finished tracks <span class="muted">${s.tracks.finished.length}</span></h2>
    ${finished ? `<ul class="plain-list">${finished}</ul>` : '<p class="muted">None yet. The first one is the hardest.</p>'}
  </section>`;

  $('#t-new', el)?.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const start = D.parseDMY(f.start.value);
    if (!start) return toast('Use the format DD.MM.YY');
    s.tracks.active = { name: f.name.value.trim(), start };
    save();
    toast('Countdown started');
    rerender();
  });
  $('#t-name', el)?.addEventListener('change', e => {
    const v = e.target.value.trim();
    if (v) { t.name = v; save(); } else e.target.value = t.name;
  });
  $('#t-start', el)?.addEventListener('change', e => {
    const iso = D.parseDMY(e.target.value);
    if (!iso) { toast('Use the format DD.MM.YY'); e.target.value = D.fmt(t.start); return; }
    t.start = iso;
    save();
    rerender();
  });
  $('#t-finish', el)?.addEventListener('click', () => {
    if (!confirm(`Mark "${t.name}" as finished today?`)) return;
    s.tracks.finished.push({ name: t.name, start: t.start, end: today });
    s.tracks.active = null;
    if (confirm('Also log it as shipped this week?')) addLog('ship', `Track: ${t.name}`, today);
    save();
    toast('Finished. Next one.');
    rerender();
  });
  $('#t-drop', el)?.addEventListener('click', () => {
    if (!confirm(`Discard "${t.name}" without adding it to finished tracks?`)) return;
    s.tracks.active = null;
    save();
    rerender();
  });
  $$('[data-del]', el).forEach(b => b.addEventListener('click', () => {
    const f = s.tracks.finished[+b.dataset.del];
    if (!confirm(`Delete "${f.name}" from the list?`)) return;
    s.tracks.finished.splice(+b.dataset.del, 1);
    save();
    rerender();
  }));
}

/* ---------- Shipping and posting log ---------- */

let logType = 'ship';

export function renderLog(el) {
  const s = store.state;
  const today = D.todayISO();
  const entries = [...s.shipLog].sort((a, b) => b.date.localeCompare(a.date));
  const groups = new Map();
  for (const e of entries) {
    const ws = D.weekStart(e.date);
    if (!groups.has(ws)) groups.set(ws, []);
    groups.get(ws).push(e);
  }
  const postDays = s.defaults.postingDays.map(i => D.DAY_SHORT[i]).join(', ') || 'none';

  const groupHtml = [...groups].map(([ws, list]) => {
    const nShip = list.filter(e => e.type === 'ship').length;
    const nPost = list.length - nShip;
    return `<section class="card stack">
      <div class="row between"><h2>${D.inProgram(ws) ? `W${D.weekNumber(ws)}` : 'Week'} <span class="muted small">${D.fmt(ws)} to ${D.fmt(D.addDays(ws, 6))}</span></h2>
      <span class="muted small">${nShip} shipped · ${nPost} posts</span></div>
      <ul class="plain-list">${list.map(e => `
        <li><span><span class="tag ${e.type}">${e.type === 'ship' ? 'Shipped' : 'Posted'}</span> ${esc(e.text)}<span class="muted small">${D.fmtLong(e.date)}</span></span>
        <button class="icon-btn" data-del="${e.id}" aria-label="Delete entry">×</button></li>`).join('')}
      </ul>
    </section>`;
  }).join('');

  el.innerHTML = `
  ${backLink}
  ${pageHead('Shipping and posting', `Posting days: ${postDays}. Change them in Defaults.`)}
  <form id="log-form" class="card stack">
    <div class="seg" role="radiogroup" aria-label="Type">
      <label><input type="radio" name="type" value="ship" ${logType === 'ship' ? 'checked' : ''}><span>Shipped</span></label>
      <label><input type="radio" name="type" value="post" ${logType === 'post' ? 'checked' : ''}><span>Posted</span></label>
    </div>
    <label class="field"><span>What</span><input name="text" required autocomplete="off" placeholder="Track, loop, clip, sketch, post"></label>
    <label class="field"><span>Date (DD.MM.YY)</span><input name="date" value="${D.fmt(today)}" required autocomplete="off"></label>
    <button class="btn primary big">Add to log</button>
  </form>
  ${groupHtml || '<p class="muted">Nothing logged yet. Small counts.</p>'}`;

  $$('input[name=type]', el).forEach(r => r.addEventListener('change', () => { logType = r.value; }));
  $('#log-form', el).addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const date = D.parseDMY(f.date.value);
    if (!date) return toast('Use the format DD.MM.YY');
    addLog(f.type.value, f.text.value, date);
    toast('Logged');
    rerender(false);
  });
  $$('[data-del]', el).forEach(b => b.addEventListener('click', () => {
    if (!confirm('Delete this entry?')) return;
    s.shipLog = s.shipLog.filter(e => e.id !== b.dataset.del);
    save();
    rerender();
  }));
}

/* ---------- Defaults ---------- */

export function renderDefaults(el) {
  const s = store.state;
  const fields = [
    ['abletonTemplate', 'Ableton template', 'Name or path of the template you always start from'],
    ['toolkit', 'Toolkit', 'The instruments, racks and samples you allow yourself'],
    ['sonicDirection', 'Sonic direction', 'A few words and references'],
    ['visualFormat', 'Visual format', 'Aspect ratio, font, colour, framing'],
  ];
  const pd = s.defaults.postingDays;

  el.innerHTML = `
  ${backLink}
  ${pageHead('Defaults')}
  ${banner('lock', '<strong>Locked until 20.12.26.</strong> Still editable, but a change here should be the exception.')}
  <div class="card stack">
    ${fields.map(([k, label, ph]) => `
      <label class="field"><span>${label}</span><textarea data-k="${k}" rows="2" placeholder="${ph}">${esc(s.defaults[k])}</textarea></label>`).join('')}
    <div class="field"><span>Posting days</span>
      <div class="chips">${D.DAY_SHORT.map((n, i) => `<button type="button" class="chip" data-dow="${i}" aria-pressed="${pd.includes(i)}">${n}</button>`).join('')}</div>
    </div>
  </div>`;

  $$('textarea[data-k]', el).forEach(t => t.addEventListener('input', () => { s.defaults[t.dataset.k] = t.value; save(); }));
  $$('.chip', el).forEach(c => c.addEventListener('click', () => {
    const i = +c.dataset.dow;
    s.defaults.postingDays = pd.includes(i) ? pd.filter(x => x !== i) : [...pd, i].sort();
    save();
    rerender();
  }));
}

/* ---------- Backup ---------- */

export function renderBackup(el) {
  const s = store.state;
  const last = s.settings.lastExport ? new Date(s.settings.lastExport) : null;

  el.innerHTML = `
  ${backLink}
  ${pageHead('Backup', 'Everything lives in this browser only. Export to keep a copy or to move to another device.')}
  <div class="card stack">
    <p>Last export: <strong>${last ? `${D.fmt(D.toISO(last))} ${D.time24(last)}` : 'never'}</strong></p>
    <button class="btn primary big" id="export">Export JSON</button>
    <label class="btn big file-btn">Import JSON<input type="file" id="import" accept="application/json,.json"></label>
    <p class="muted small">Import replaces all data on this device with the file's content.</p>
  </div>
  <div class="card stack">
    <h2>Danger zone</h2>
    <button class="btn ghost danger" id="reset">Erase all data on this device</button>
  </div>`;

  $('#export', el).addEventListener('click', () => { exportBackup(); toast('Backup downloaded'); rerender(); });
  $('#import', el).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Replace all current data with this backup?')) { e.target.value = ''; return; }
    try {
      await importBackup(file);
      applyTheme(store.state.settings.theme);
      toast('Backup imported');
      rerender();
    } catch (err) {
      alert(err.message);
      e.target.value = '';
    }
  });
  $('#reset', el).addEventListener('click', () => {
    if (!confirm('Erase everything on this device?')) return;
    if (!confirm('Really? This cannot be undone without a backup.')) return;
    localStorage.removeItem(KEY);
    store.state = defaultState();
    store.save();
    applyTheme('dark');
    rerender();
  });
}
