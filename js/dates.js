// Date helpers. Internal dates are ISO strings (YYYY-MM-DD), display is always DD.MM.YY.

export const START = '2026-09-28';
export const END = '2026-12-20';
export const TOTAL_DAYS = 84;

// The day rolls over at 04:00, so a late session after midnight still counts for the evening before.
export const ROLLOVER_HOUR = 4;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const pad = n => String(n).padStart(2, '0');

// Noon avoids daylight saving edge cases when adding days.
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return toISO(d);
}

export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Number of days from a to b (b minus a).
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// 0 = Mon ... 6 = Sun
export function dow(s) {
  return (parseISO(s).getDay() + 6) % 7;
}

export const dayName = s => DAY_NAMES[dow(s)];
export const DAY_SHORT = DAY_NAMES;

export function fmt(s) {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

export const fmtLong = s => `${dayName(s)} ${fmt(s)}`;

// Accepts D.M.YY, DD.MM.YY or DD.MM.YYYY. Returns ISO or null.
export function parseDMY(str) {
  const m = String(str).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  const d = new Date(y, +m[2] - 1, +m[1], 12);
  if (d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
  return toISO(d);
}

export const time24 = (date = new Date()) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const weekStart = s => addDays(s, -dow(s));
export const weekEnd = s => addDays(weekStart(s), 6);
export const weekDays = s => Array.from({ length: 7 }, (_, i) => addDays(weekStart(s), i));

// 0 to 83 inside the program, negative before, 84+ after.
export const dayIndex = s => diffDays(START, s);
// 1 to 12 inside the program.
export const weekNumber = s => Math.floor(dayIndex(s) / 7) + 1;
export const inProgram = s => dayIndex(s) >= 0 && dayIndex(s) < TOTAL_DAYS;
export const programDays = () => Array.from({ length: TOTAL_DAYS }, (_, i) => addDays(START, i));
