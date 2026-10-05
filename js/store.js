// Persistence: one versioned localStorage key, plus JSON export and import.

export const KEY = 'outputTracker.v1';
export const VERSION = 1;

export function defaultState() {
  return {
    version: VERSION,
    settings: { theme: 'dark', lastExport: null },
    days: {},
  };
}

// Brings any stored or imported object up to the current version.
// Fields from the earlier, bigger version of the app (tracks, reviews, logs) are kept untouched.
export function migrate(data) {
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') {
    throw new Error('This file does not look like an Output Tracker backup.');
  }
  if (data.version > VERSION) {
    throw new Error('This backup comes from a newer version of the app.');
  }
  const base = defaultState();
  return {
    ...base,
    ...data,
    version: VERSION,
    settings: { ...base.settings, ...(data.settings || {}) },
    days: data.days || {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not load saved data, starting fresh.', e);
  }
  return defaultState();
}

export const store = {
  state: load(),
  onSave: null, // set by sync.js
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      alert('Saving failed. Storage may be full or blocked. Export a backup now.');
    }
    this.onSave?.();
  },
  replace(next) {
    this.state = migrate(next);
    this.save();
  },
};

export function exportBackup() {
  const s = store.state;
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}.${p(now.getMonth() + 1)}.${String(now.getFullYear()).slice(2)}`;
  s.settings.lastExport = now.toISOString();
  store.save();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `output-tracker-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  store.replace(data);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
