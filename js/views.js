// View renderers. Each one receives the <main> element and fills it.
import { store, exportBackup, importBackup, defaultState, KEY } from './store.js';
import * as D from './dates.js';
import * as L from './logic.js';
import * as S from './sync.js';

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

// The five daily rows. Exercise is done by tapping one or more of its chips; the rest are checkboxes.
function taskRows(day, hints = {}) {
  return L.TASKS.map(t => {
    const hint = hints[t.key] || t.hint;
    if (t.key === 'exercise') {
      const done = L.isDone(day, 'exercise');
      return `<li><div class="check${done ? ' on' : ''}" role="group" aria-label="Exercise">
        <span class="box" aria-hidden="true"></span>
        <span class="check-text"><span class="check-label">${t.label}</span>
          <span class="chips">${L.EXERCISES.map(x => `<button type="button" class="chip small" data-ex="${x.key}" aria-pressed="${(day.exercise || []).includes(x.key)}">${x.label}</button>`).join('')}</span>
        </span>
      </div></li>`;
    }
    return `<li><label class="check">
      <input type="checkbox" data-key="${t.key}" ${day[t.key] ? 'checked' : ''}>
      <span class="box" aria-hidden="true"></span>
      <span class="check-text"><span class="check-label">${t.label}</span><span class="floor">${hint}</span></span>
    </label></li>`;
  }).join('');
}

function bindTaskRows(el, s, iso, after) {
  $$('.checks input[data-key]', el).forEach(cb => cb.addEventListener('change', () => {
    L.ensureDay(s, iso)[cb.dataset.key] = cb.checked;
    save();
    rerender();
    after?.(cb.checked);
  }));
  $$('.checks [data-ex]', el).forEach(b => b.addEventListener('click', () => {
    const d = L.ensureDay(s, iso);
    const k = b.dataset.ex;
    const on = !d.exercise.includes(k);
    d.exercise = on ? [...d.exercise, k] : d.exercise.filter(x => x !== k);
    save();
    rerender();
    after?.(on);
  }));
}

/* ---------- Today ---------- */

export function renderToday(el) {
  const s = store.state;
  const today = D.todayISO();
  const day = L.getDay(s, today);
  const idx = D.dayIndex(today);
  const st = L.streakInfo(s, today);
  const run = L.nopoRun(s, today);
  const alerts = [];

  if (idx < 0) alerts.push(banner('info', `The 12 weeks start on ${D.fmtLong(D.START)}.`));
  if (idx >= D.TOTAL_DAYS) alerts.push(banner('info', 'The 12 weeks are done. Well held.'));
  if (!st.todayDone && st.broken && idx > 1) {
    alerts.push(banner('warn', 'Two days missed. No drama, start a fresh chain today.'));
  } else if (!st.todayDone && st.yesterdayMissed) {
    alerts.push(banner('accent', '<strong>Yesterday was missed.</strong> Today keeps the chain alive.'));
  }

  const weekLabel = D.inProgram(today) ? `W${D.weekNumber(today)} of 12` : 'Outside the 12 weeks';
  const nopoHint = run ? `${run} ${run === 1 ? 'day' : 'days'} in a row` : 'Abstained today';

  el.innerHTML = `
  <section class="stack">
    <header class="day-head">
      <div>
        <p class="eyebrow">${weekLabel}</p>
        <h1>${D.fmtLong(today)}</h1>
      </div>
      <div class="streak${st.todayDone ? ' lit' : ''}" title="Best chain: ${st.best}">
        <span class="streak-num">${st.current}</span><span class="streak-label">day chain</span>
      </div>
    </header>
    ${alerts.join('')}
    <ul class="checks">${taskRows(day, { nopo: nopoHint })}</ul>
    <label class="field"><span>Homework for Life</span>
      <textarea id="hfl" rows="2" placeholder="One or two sentences. Which moment from today is worth a story?">${esc(day.hflText)}</textarea>
    </label>
  </section>`;

  bindTaskRows(el, s, today, on => {
    if (on && L.isComplete(s, today)) toast('All five. The chain holds.');
  });
  $('#hfl', el).addEventListener('input', e => { L.ensureDay(s, today).hflText = e.target.value; save(); });
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
  const nopoDays = past.filter(d => L.getDay(s, d).nopo).length;
  const N = L.TASKS.length;

  let grid = `<div></div>${D.DAY_SHORT.map(n => `<div class="cal-h">${n}</div>`).join('')}`;
  for (let w = 0; w < 12; w++) {
    grid += `<div class="cal-w">W${w + 1}</div>`;
    for (let i = 0; i < 7; i++) {
      const d = D.addDays(D.START, w * 7 + i);
      const n = L.hits(s, d);
      const cls = `cal-day lv${n}${d > today ? ' future' : ''}${d === today ? ' today' : ''}${d === sel ? ' sel' : ''}`;
      grid += `<button class="${cls}" data-date="${d}" aria-pressed="${d === sel}" aria-label="${D.fmtLong(d)}, ${n} of ${N} done">${+d.slice(8)}</button>`;
    }
  }

  const sd = L.getDay(s, sel);
  const detailBody = sel > today ? '<p class="muted">Still ahead.</p>' : `
    <ul class="checks compact">${taskRows(sd)}</ul>
    ${sd.hflText ? `<div><p class="eyebrow">Homework for Life</p><p>${esc(sd.hflText)}</p></div>` : ''}
    <p class="muted small">Forgot to tick something? Fix it here.</p>`;

  el.innerHTML = `
  ${pageHead('History', `${complete} of ${past.length} days complete · chain ${st.current} · best ${st.best} · NoPo ${nopoDays} of ${past.length}`)}
  <div class="cal" role="group" aria-label="84 days">${grid}</div>
  <ul class="legend">
    ${Array.from({ length: N + 1 }, (_, n) => `<li><i class="sw lv${n}"></i>${n === N ? `All ${N}` : n}</li>`).join('')}
  </ul>
  <section class="card stack">
    <div class="row between"><h2>${D.fmtLong(sel)}</h2><span class="pill">${L.hits(s, sel)}/${N}</span></div>
    ${detailBody}
  </section>`;

  $$('.cal-day', el).forEach(b => b.addEventListener('click', () => { historySel = b.dataset.date; rerender(); }));
  bindTaskRows(el, s, sel);
}

/* ---------- More ---------- */

export function renderMore(el) {
  const s = store.state;
  const last = s.settings.lastExport ? new Date(s.settings.lastExport) : null;
  const stale = !S.isSignedIn() && (!last || (Date.now() - last) > 7 * 86400000);
  const items = [
    ['#/sync', 'Cloud sync', esc(S.syncSummary())],
    ['#/backup', 'Backup', last ? `Last export ${D.fmt(D.toISO(last))} ${D.time24(last)}` : 'Never exported'],
  ];

  el.innerHTML = `
  ${pageHead('More')}
  ${stale ? banner('warn', 'Your data lives only in this browser. Turn on cloud sync or export a backup now and then.') : ''}
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

/* ---------- Backup ---------- */

export function renderBackup(el) {
  const s = store.state;
  const last = s.settings.lastExport ? new Date(s.settings.lastExport) : null;
  let conflict = null;
  try { conflict = JSON.parse(localStorage.getItem(S.BACKUP_KEY)); } catch { /* none */ }

  el.innerHTML = `
  ${backLink}
  ${pageHead('Backup', 'Everything lives in this browser only. Export to keep a copy or to move to another device.')}
  <div class="card stack">
    <p>Last export: <strong>${last ? `${D.fmt(D.toISO(last))} ${D.time24(last)}` : 'never'}</strong></p>
    <button class="btn primary big" id="export">Export JSON</button>
    <label class="btn big file-btn">Import JSON<input type="file" id="import" accept="application/json,.json"></label>
    <p class="muted small">Import replaces all data on this device with the file's content.</p>
    ${conflict ? `<button class="btn ghost" id="conflict">Download the copy saved before the last sync overwrite (${D.fmt(D.toISO(new Date(conflict.savedAt)))})</button>` : ''}
  </div>
  <div class="card stack">
    <h2>Danger zone</h2>
    <button class="btn ghost danger" id="reset">Erase all data on this device</button>
  </div>`;

  $('#export', el).addEventListener('click', () => { exportBackup(); toast('Backup downloaded'); rerender(); });
  $('#conflict', el)?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(conflict.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'output-tracker-before-sync.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
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

/* ---------- Cloud sync ---------- */

export function renderSync(el) {
  const st = S.syncState;
  let body;

  if (!S.isSignedIn()) {
    body = `
    <form id="auth" class="card stack">
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="field"><span>Password</span><input name="password" type="password" required minlength="6" autocomplete="current-password"></label>
      <button class="btn primary big">Sign in</button>
      <button class="btn big" type="button" id="signup">Create account</button>
      <p class="muted small" id="auth-msg">${esc(st.message)}</p>
    </form>
    <p class="muted small">Use the same email and password on every device. Your data on this device stays here until you sign in.</p>`;
  } else {
    const choose = st.status === 'choose' ? banner('accent',
      '<strong>This device and the cloud both have data.</strong> Which one should win? The other copy is kept as a backup.',
      `<div class="stack" style="margin-top:10px">
        <button class="btn primary" data-choose="cloud">Use cloud data (saved ${esc(S.pendingSavedAt())})</button>
        <button class="btn" data-choose="local">Keep this device's data</button>
      </div>`) : '';
    body = `
    ${choose}
    <div class="card stack">
      <p>Signed in as <strong>${esc(S.signedInEmail() || 'you')}</strong></p>
      <p class="muted">${esc(S.syncSummary())}</p>
      <button class="btn primary big" id="sync-now" ${st.status === 'syncing' || st.status === 'choose' ? 'disabled' : ''}>Sync now</button>
      <button class="btn ghost" id="sign-out">Sign out on this device</button>
    </div>
    <p class="muted small">Changes upload a few seconds after you make them and when you leave the app. Other devices pick them up when opened. Offline edits wait and upload later.</p>`;
  }

  el.innerHTML = `
  ${backLink}
  ${pageHead('Cloud sync', 'Keeps phone and desktop in step. The app still works offline.')}
  ${body}`;

  const form = $('#auth', el);
  if (form) {
    const msg = $('#auth-msg', el);
    const run = async (fn, busyText) => {
      if (!form.reportValidity()) return;
      const buttons = $$('button', form);
      buttons.forEach(b => { b.disabled = true; });
      msg.textContent = busyText;
      try {
        await fn(form.elements.email.value.trim(), form.elements.password.value);
      } catch (e) {
        msg.textContent = e.message;
        buttons.forEach(b => { b.disabled = false; });
      }
    };
    form.addEventListener('submit', e => {
      e.preventDefault();
      run(async (email, pw) => { await S.signIn(email, pw); toast('Signed in'); rerender(); }, 'Signing in');
    });
    $('#signup', el).addEventListener('click', () => run(async (email, pw) => {
      const result = await S.signUp(email, pw);
      if (result === 'confirm') {
        msg.textContent = 'Check your email and open the confirmation link. Then sign in here with your password.';
        $$('button', form).forEach(b => { b.disabled = false; });
      } else {
        toast('Account created');
        rerender();
      }
    }, 'Creating account'));
  }
  $('#sync-now', el)?.addEventListener('click', () => S.syncNow());
  $('#sign-out', el)?.addEventListener('click', () => {
    if (!confirm('Sign out on this device? Your data stays here, it just stops syncing.')) return;
    S.signOut();
    rerender();
  });
  $$('[data-choose]', el).forEach(b => b.addEventListener('click', () => {
    S.resolveChoice(b.dataset.choose === 'cloud');
    rerender();
  }));
}
