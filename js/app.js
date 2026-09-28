// Entry point: hash router, tab bar state, theme, service worker.
import { store } from './store.js';
import * as D from './dates.js';
import * as V from './views.js';
import { resumeWarmup } from './timer.js';
import { initSync } from './sync.js';

const routes = {
  today: V.renderToday,
  timeline: V.renderTimeline,
  review: V.renderReview,
  history: V.renderHistory,
  more: V.renderMore,
  energy: V.renderEnergy,
  track: V.renderTrack,
  log: V.renderLog,
  defaults: V.renderDefaults,
  backup: V.renderBackup,
  sync: V.renderSync,
};
const underMore = ['more', 'energy', 'track', 'log', 'defaults', 'backup', 'sync'];

const view = document.getElementById('view');
let lastDay = D.todayISO();
let lastHour = new Date().getHours();

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '') || 'today';
  return routes[r] ? r : 'today';
}

function render() {
  const r = currentRoute();
  view.className = r === 'timeline' ? 'wide' : '';
  routes[r](view);
  document.querySelectorAll('.tabbar a').forEach(a => {
    const on = a.dataset.tab === r || (a.dataset.tab === 'more' && underMore.includes(r));
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  lastDay = D.todayISO();
  lastHour = new Date().getHours();
}

window.addEventListener('app:render', render);
window.addEventListener('app:toast', e => V.toast(e.detail));
// Sync status only shows on More and Cloud sync, so only those redraw, and never mid-typing.
window.addEventListener('sync:status', () => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (!typing && ['more', 'sync'].includes(currentRoute())) render();
});
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Refresh when the day rolls over or the hour changes (hard stop reminder), unless you are typing.
function refreshIfStale() {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (typing) return;
  if (D.todayISO() !== lastDay || new Date().getHours() !== lastHour) render();
}
setInterval(refreshIfStale, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  refreshIfStale();
  resumeWarmup();
});

V.applyTheme(store.state.settings.theme);
initSync();
render();
resumeWarmup();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});
