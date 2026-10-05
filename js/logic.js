// Daily rules: what counts, the chain, and the NoPo run.
import * as D from './dates.js';

export const TASKS = [
  { key: 'nopo', label: 'NoPo', hint: 'Abstained today' },
  {
    key: 'exercise', label: 'Exercise',
    chips: [{ key: 'jog', label: 'Jog' }, { key: 'row', label: 'Row' }, { key: 'workout', label: 'Workout' }],
  },
  { key: 'music', label: 'Ableton / Piano', chips: [{ key: 'ableton', label: 'Ableton' }, { key: 'piano', label: 'Piano' }] },
  { key: 'pages', label: 'Night Pages', hint: 'Journal' },
  { key: 'hfl', label: 'Homework for Life', hint: '1 to 2 sentences' },
];

// Rows with chips are done when at least one chip is on; the rest are plain checkboxes.
const CHIP_KEYS = TASKS.filter(t => t.chips).map(t => t.key);

export const getDay = (state, s) => state.days[s] || {};

export function ensureDay(state, s) {
  const d = (state.days[s] ||= {});
  for (const k of CHIP_KEYS) d[k] = Array.isArray(d[k]) ? d[k] : [];
  d.hflText ??= '';
  return d;
}

export const isDone = (day, key) => (CHIP_KEYS.includes(key) ? Array.isArray(day[key]) && day[key].length > 0 : !!day[key]);
export const hits = (state, s) => TASKS.filter(t => isDone(getDay(state, s), t.key)).length;
export const isComplete = (state, s) => hits(state, s) === TASKS.length;

// A day counts when all five are done. Rule: never miss two days in a row.
// One missed day keeps the chain, a second miss in a row resets it. Today only counts once done.
export function streakInfo(state, today) {
  let current = 0, best = 0, misses = 0;
  for (const d of D.daysUntil(today)) {
    if (isComplete(state, d)) {
      current++;
      misses = 0;
      best = Math.max(best, current);
    } else if (d !== today) {
      misses++;
      if (misses >= 2) current = 0;
    }
  }
  const missed = s => s >= D.START && !isComplete(state, s);
  const y = D.addDays(today, -1);
  return {
    current,
    best,
    todayDone: isComplete(state, today),
    yesterdayMissed: missed(y),
    broken: missed(y) && missed(D.addDays(y, -1)),
  };
}

// Consecutive NoPo days up to today (or up to yesterday while today is still open). Strict, no grace day.
export function nopoRun(state, today) {
  let d = getDay(state, today).nopo ? today : D.addDays(today, -1);
  let n = 0;
  while (d >= D.START && getDay(state, d).nopo) {
    n++;
    d = D.addDays(d, -1);
  }
  return n;
}
