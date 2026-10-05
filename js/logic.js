// Daily rules: what counts, the chain, and the NoPo run.
import * as D from './dates.js';

export const TASKS = [
  { key: 'nopo', label: 'NoPo', hint: 'Abstained today' },
  { key: 'exercise', label: 'Exercise', hint: 'Jog, row or workout' },
  { key: 'ableton', label: 'Ableton', hint: 'One session' },
  { key: 'pages', label: 'Night Pages', hint: 'Journal' },
  { key: 'hfl', label: 'Homework for Life', hint: '1 to 2 sentences' },
];

export const EXERCISES = [
  { key: 'jog', label: 'Jog' },
  { key: 'row', label: 'Row' },
  { key: 'workout', label: 'Workout' },
];

export const getDay = (state, s) => state.days[s] || {};

export function ensureDay(state, s) {
  const d = (state.days[s] ||= {});
  d.exercise = Array.isArray(d.exercise) ? d.exercise : [];
  d.hflText ??= '';
  return d;
}

export const isDone = (day, key) => (key === 'exercise' ? Array.isArray(day.exercise) && day.exercise.length > 0 : !!day[key]);
export const hits = (state, s) => TASKS.filter(t => isDone(getDay(state, s), t.key)).length;
export const isComplete = (state, s) => hits(state, s) === TASKS.length;

// A day counts when all five are done. Rule: never miss two days in a row.
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

// Consecutive NoPo days up to today (or up to yesterday while today is still open). Strict, no grace day.
export function nopoRun(state, today) {
  let d = getDay(state, today).nopo ? today : D.addDays(today, -1);
  let n = 0;
  while (getDay(state, d).nopo) {
    n++;
    d = D.addDays(d, -1);
  }
  return n;
}
