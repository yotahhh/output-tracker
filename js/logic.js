// Rules of the framework: floors, streak, warm-up count, track countdown.
import * as D from './dates.js';

export const TASKS = [
  { key: 'pages', label: 'Night Pages' },
  { key: 'piano', label: 'Piano' },
  { key: 'ableton', label: 'Ableton' },
  { key: 'hfl', label: 'Homework for Life' },
];

export const TRACK_DAYS = 21;

export const CHECKPOINTS = [
  { day: 14, date: '2026-10-11', label: 'Visual format fixed', detail: 'End of W2' },
  { day: 56, date: '2026-11-22', label: 'Reread your pages', detail: 'End of W8' },
  { day: 84, date: D.END, label: 'Big review', detail: 'Final day' },
];

export const PHASES = [
  { from: 0, to: 28, weeks: 'W1 to 4', label: 'Build the habits' },
  { from: 28, to: 56, weeks: 'W5 to 8', label: 'Finish things' },
  { from: 56, to: 84, weeks: 'W9 to 12', label: 'Release and review' },
];

export const isProtectionDay = s => D.dow(s) <= 1;

export function floorsFor(s) {
  return isProtectionDay(s)
    ? { pages: 'Half a page', piano: '10 min', ableton: '15 min, low-energy task', hfl: '1 to 2 sentences' }
    : { pages: '1 to 3 pages', piano: '10 min+', ableton: '60 min+', hfl: '1 to 2 sentences' };
}

export const getDay = (state, s) => state.days[s] || {};

export function ensureDay(state, s) {
  const d = (state.days[s] ||= {});
  for (const t of TASKS) d[t.key] ??= false;
  d.hflText ??= '';
  d.microTaskTomorrow ??= '';
  d.warmups ||= [];
  return d;
}

export const floorsHit = (state, s) => TASKS.filter(t => getDay(state, s)[t.key]).length;
export const isComplete = (state, s) => floorsHit(state, s) === 4;

// A day counts when all four floors are checked. Rule: never miss two days in a row.
// One missed day keeps the chain, a second miss in a row resets it. Today only counts once done.
export function streakInfo(state, today) {
  let current = 0, best = 0, misses = 0;
  for (let i = 0; i < D.TOTAL_DAYS; i++) {
    const d = D.addDays(D.START, i);
    if (d > today) break;
    if (isComplete(state, d)) {
      current++;
      misses = 0;
      best = Math.max(best, current);
    } else if (d !== today) {
      misses++;
      if (misses >= 2) current = 0;
    }
  }
  const missed = s => D.dayIndex(s) >= 0 && !isComplete(state, s);
  const y = D.addDays(today, -1);
  return {
    current,
    best,
    todayDone: isComplete(state, today),
    yesterdayMissed: missed(y),
    broken: missed(y) && missed(D.addDays(y, -1)),
  };
}

export function warmupsThisWeek(state, today) {
  const list = D.weekDays(today).flatMap(d => getDay(state, d).warmups || []);
  return { ignored: list.filter(w => !w.respected).length, respected: list.filter(w => w.respected).length };
}

export const logThisWeek = (state, today, type) =>
  state.shipLog.filter(e => e.type === type && D.weekStart(e.date) === D.weekStart(today));

export function trackStatus(track, today) {
  const elapsed = D.diffDays(track.start, today);
  return { day: elapsed + 1, left: TRACK_DAYS - elapsed, end: D.addDays(track.start, TRACK_DAYS - 1) };
}

export function pickOne(list, last) {
  const pool = list.length > 1 ? list.filter(x => x !== last) : list;
  return pool[Math.floor(Math.random() * pool.length)];
}
