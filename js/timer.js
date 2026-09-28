// Warm-up flow: one setup step, a 20 min countdown, then a chime and a yes/no log.
import { store } from './store.js';
import * as D from './dates.js';
import { ensureDay } from './logic.js';

const WARMUP_MS = 20 * 60 * 1000;
const APP_TITLE = 'Output Tracker';
let audio = null;
let tickId = null;
let wakeLock = null;

const overlay = () => document.getElementById('overlay');
const body = () => document.getElementById('overlay-body');

function show(html) {
  body().innerHTML = html;
  overlay().hidden = false;
  document.body.classList.add('locked');
  body().querySelector('button')?.focus();
}

function hide() {
  clearInterval(tickId);
  overlay().hidden = true;
  body().innerHTML = '';
  document.body.classList.remove('locked');
  document.title = APP_TITLE;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// Audio must be unlocked by a user gesture, so this runs on the confirm tap.
function unlockAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch { /* no audio available */ }
}

function chime() {
  if (!audio) unlockAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const notes = [659.25, 880, 987.77, 659.25, 880, 987.77];
  notes.forEach((f, i) => {
    const t = now + i * 0.32 + (i > 2 ? 0.6 : 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 1.5);
  });
}

async function requestWake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* not supported or denied */ }
}

export function openWarmup() {
  if (store.state.timer) return runCountdown();
  show(`
    <p class="eyebrow">Warm-up, step 1 of 2</p>
    <h2>Open your Ableton project and press play once.</h2>
    <p class="muted">Just once. That is the whole step.</p>
    <div class="sheet-actions">
      <button class="btn primary big" data-a="go">Done, start 20 min</button>
      <button class="btn ghost" data-a="cancel">Cancel</button>
    </div>`);
  body().querySelector('[data-a=go]').onclick = () => {
    unlockAudio();
    store.state.timer = { endAt: Date.now() + WARMUP_MS, day: D.todayISO() };
    store.save();
    runCountdown();
  };
  body().querySelector('[data-a=cancel]').onclick = hide;
}

function runCountdown() {
  show(`
    <p class="eyebrow">Warm-up, step 2 of 2</p>
    <div class="countdown" id="cd">20:00</div>
    <p class="muted center">Play, loop, tweak. When it rings, you stop.</p>
    <div class="sheet-actions">
      <button class="btn ghost" data-a="stop">Stop timer</button>
    </div>`);
  requestWake();
  body().querySelector('[data-a=stop]').onclick = () => {
    if (!confirm('Stop the warm-up timer? Nothing gets logged.')) return;
    store.state.timer = null;
    store.save();
    hide();
  };
  const tick = () => {
    const t = store.state.timer;
    if (!t) return hide();
    const left = t.endAt - Date.now();
    if (left <= 0) return finish();
    const txt = `${D.pad(Math.floor(left / 60000))}:${D.pad(Math.floor((left % 60000) / 1000))}`;
    const cd = document.getElementById('cd');
    if (cd) cd.textContent = txt;
    document.title = `${txt} Warm-up`;
  };
  clearInterval(tickId);
  tick();
  tickId = setInterval(tick, 250);
}

function finish() {
  clearInterval(tickId);
  const day = store.state.timer?.day || D.todayISO();
  store.state.timer = null;
  store.save();
  chime();
  navigator.vibrate?.([300, 150, 300]);
  show(`
    <p class="eyebrow">20 min done</p>
    <h2>Stand up, get water, 10 min piano.</h2>
    <p>Did you respect the timer?</p>
    <div class="sheet-actions two">
      <button class="btn primary big" data-r="1">Yes, I stopped</button>
      <button class="btn big" data-r="0">No, I kept going</button>
    </div>`);
  document.title = 'Time is up';
  body().querySelectorAll('[data-r]').forEach(b => {
    b.onclick = () => {
      ensureDay(store.state, day).warmups.push({ at: D.time24(), respected: b.dataset.r === '1' });
      store.save();
      hide();
      window.dispatchEvent(new Event('app:render'));
    };
  });
}

// Picks a running timer back up after a reload or when the phone wakes.
export function resumeWarmup() {
  if (store.state.timer && document.getElementById('overlay').hidden) runCountdown();
}
