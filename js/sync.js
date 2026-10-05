// Cloud sync with Supabase over its REST API, no SDK needed.
// localStorage stays the working copy so the app keeps running offline; the cloud holds one JSON row per user.
import { store, migrate } from './store.js';
import * as D from './dates.js';

const BASE = 'https://xmdhqcyalehbwsolfdgz.supabase.co';
const API_KEY = 'sb_publishable_aFzK-zJmEXfZ9DxfdR__zw_11f7wzn0';
const META_KEY = 'outputTracker.sync';
export const BACKUP_KEY = 'outputTracker.conflictBackup';
const PUSH_DELAY = 2500;

let meta = readMeta();
let running = null;
let again = false;
let pushTimer = null;
let applying = false;
let refreshing = null;

export const syncState = { status: meta.session ? 'idle' : 'signed-out', message: '', pending: null };

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
}
function writeMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* storage blocked */ }
}
function setStatus(status, message = '') {
  syncState.status = status;
  syncState.message = message;
  window.dispatchEvent(new Event('sync:status'));
}
const say = msg => window.dispatchEvent(new CustomEvent('app:toast', { detail: msg }));
const stamp = t => `${D.fmt(D.toISO(new Date(t)))} ${D.time24(new Date(t))}`;

export const isSignedIn = () => !!meta.session;
export const signedInEmail = () => meta.session?.email || '';

export function syncSummary() {
  switch (syncState.status) {
    case 'signed-out': return 'Off. Sign in to sync phone and desktop';
    case 'syncing': return 'Syncing';
    case 'offline': return 'Offline, changes sync later';
    case 'error': return `Problem: ${syncState.message}`;
    case 'choose': return 'Needs your choice';
    default: return meta.lastSuccess ? `Synced ${stamp(meta.lastSuccess)}` : 'On';
  }
}

/* ---------- Auth ---------- */

async function authRequest(path, body) {
  const res = await fetch(`${BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.msg || json.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function storeSession(json) {
  meta.session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at ? json.expires_at * 1000 : Date.now() + (json.expires_in || 3600) * 1000,
    email: json.user?.email || meta.session?.email || '',
    user_id: json.user?.id || meta.session?.user_id,
  };
  writeMeta();
}

function dropSession(message) {
  meta.session = null;
  meta.syncedAt = null;
  writeMeta();
  syncState.pending = null;
  setStatus('signed-out', message);
}

async function accessToken() {
  const s = meta.session;
  if (!s) throw new Error('Not signed in');
  if (Date.now() < s.expires_at - 60000) return s.access_token;
  refreshing ||= authRequest('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    .then(storeSession)
    .finally(() => { refreshing = null; });
  try {
    await refreshing;
  } catch (e) {
    // Only a rejected refresh token signs you out; a network error just waits for the next try.
    if (e.status === 400 || e.status === 401) dropSession('Session expired. Sign in again.');
    throw e;
  }
  return meta.session.access_token;
}

export async function signIn(email, password) {
  storeSession(await authRequest('token?grant_type=password', { email, password }));
  meta.syncedAt = null;
  writeMeta();
  await syncNow();
}

// Returns 'signed-in', or 'confirm' when Supabase wants the email address confirmed first.
export async function signUp(email, password) {
  const redirect = encodeURIComponent(location.origin + location.pathname);
  const json = await authRequest(`signup?redirect_to=${redirect}`, { email, password });
  if (!json.access_token) return 'confirm';
  storeSession(json);
  meta.syncedAt = null;
  writeMeta();
  await syncNow();
  return 'signed-in';
}

export function signOut() {
  const token = meta.session?.access_token;
  dropSession('');
  if (token) {
    fetch(`${BASE}/auth/v1/logout`, { method: 'POST', headers: { apikey: API_KEY, Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}

// The confirmation email links back here with the session in the URL hash.
async function handleRedirect() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(hash)) return;
  const p = new URLSearchParams(hash);
  history.replaceState(null, '', `${location.pathname}#/sync`);
  if (p.get('error')) {
    setStatus('signed-out', p.get('error_description') || 'The sign-in link did not work. Sign in with your password.');
    return;
  }
  meta.session = {
    access_token: p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    expires_at: +p.get('expires_at') * 1000 || Date.now() + (+p.get('expires_in') || 3600) * 1000,
  };
  try {
    const res = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: API_KEY, Authorization: `Bearer ${meta.session.access_token}` } });
    const user = await res.json();
    meta.session.email = user.email;
    meta.session.user_id = user.id;
  } catch { /* email shows up after the next refresh */ }
  meta.syncedAt = null;
  writeMeta();
  setStatus('idle');
  say('Email confirmed, sync is on');
}

/* ---------- Data ---------- */

async function rest(path, opts = {}, retried = false) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 && !retried && meta.session) {
    meta.session.expires_at = 0;
    return rest(path, opts, true);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Sync failed (${res.status})`);
  return json;
}

const pull = async () => (await rest('state?select=data,updated_at'))[0] || null;

const payload = () => store.state;

async function push({ keepalive = false } = {}) {
  const changedBefore = meta.changedAt;
  const body = JSON.stringify({ ...(meta.session.user_id ? { user_id: meta.session.user_id } : {}), data: payload() });
  const rows = await rest('state?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body,
    keepalive: keepalive && body.length < 60000,
  });
  meta.syncedAt = rows[0].updated_at;
  // Edits made while the upload was in flight stay pending for the next round.
  if (meta.changedAt === changedBefore) meta.dirty = false;
  writeMeta();
}

function backupLocal() {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: store.state }));
  } catch { /* storage full */ }
}

function applyRemote(remote) {
  const local = store.state;
  const next = migrate(remote.data);
  next.settings.theme = local.settings.theme; // theme stays per device
  applying = true;
  store.state = next;
  store.save();
  applying = false;
  meta.syncedAt = remote.updated_at;
  meta.dirty = false;
  writeMeta();
  window.dispatchEvent(new Event('app:render'));
}

const isEmpty = s => !Object.keys(s.days).length;

export function syncNow() {
  if (!meta.session) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setStatus('syncing');
    try {
      const remote = await pull();
      if (!remote) {
        await push();
      } else if (!meta.syncedAt) {
        // First sync on this device: never merge silently.
        if (isEmpty(store.state)) {
          applyRemote(remote);
        } else {
          syncState.pending = remote;
          setStatus('choose');
          return;
        }
      } else if (remote.updated_at !== meta.syncedAt) {
        // Another device saved since our last sync. The newer change wins; the loser is kept as a backup.
        if (meta.dirty && (meta.changedAt || 0) > Date.parse(remote.updated_at)) {
          await push();
        } else {
          if (meta.dirty) backupLocal();
          applyRemote(remote);
          say('Updated from the cloud');
        }
      } else if (meta.dirty) {
        await push();
      }
      meta.lastSuccess = Date.now();
      writeMeta();
      setStatus('idle');
    } catch (e) {
      if (!meta.session) return;
      if (navigator.onLine) setStatus('error', e.message);
      else setStatus('offline');
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      syncNow();
    }
  });
  return running;
}

export function resolveChoice(useCloud) {
  const remote = syncState.pending;
  if (!remote) return;
  syncState.pending = null;
  if (useCloud) {
    backupLocal();
    applyRemote(remote);
  } else {
    meta.syncedAt = remote.updated_at;
    meta.dirty = true;
    meta.changedAt = Date.now();
    writeMeta();
  }
  syncNow();
}

export function pendingSavedAt() {
  return syncState.pending ? stamp(syncState.pending.updated_at) : '';
}

function onLocalSave() {
  if (applying) return;
  meta.dirty = true;
  meta.changedAt = Date.now();
  writeMeta();
  if (!meta.session) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, PUSH_DELAY);
}

// When the app goes to the background, upload right away instead of waiting.
function flush() {
  if (!meta.session || !meta.syncedAt || !meta.dirty || syncState.status === 'choose') return;
  clearTimeout(pushTimer);
  push({ keepalive: true }).catch(() => {});
}

export function initSync() {
  store.onSave = onLocalSave;
  handleRedirect().finally(() => syncNow());
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
    else flush();
  });
}
