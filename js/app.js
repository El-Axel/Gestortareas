// Arranque: navegación, atajos de teclado y conexión entre los datos y la sincronización.

import { store } from './store.js';
import { $, esc, ago } from './util.js';
import { icon, clapper } from './ui/icons.js';
import { enter, clap } from './ui/motion.js';
import { toast } from './ui/toast.js';
import { sheetOpen, closeSheet } from './ui/sheet.js';
import { applyTheme } from './theme.js';
import { newVideo } from './views/video-sheet.js';
import { newEvent } from './views/event-sheet.js';
import * as hoy from './views/hoy.js';
import * as videos from './views/videos.js';
import * as calendario from './views/calendario.js';
import * as ajustes from './views/ajustes.js';
import { status as syncStatus, onSync, scheduleSync, syncNow, connect, preload, isConnected } from './google/sync.js';

const VIEWS = {
  hoy: { mod: hoy, label: 'Hoy', icon: 'today' },
  videos: { mod: videos, label: 'Videos', icon: 'board' },
  calendario: { mod: calendario, label: 'Calendario', icon: 'calendar' },
  ajustes: { mod: ajustes, label: 'Ajustes', icon: 'settings' },
};
const ORDER = Object.keys(VIEWS);

const viewEl = $('#view');
let current = null;
let currentName = '';

/* ---------- Navegación ---------- */

$('#rail').innerHTML = `
  <a class="brand" href="#/hoy" aria-label="Claqueta, ir a Hoy">${clapper(30)}<span>Claqueta</span></a>
  <ul class="rail__nav">
    ${ORDER.map((name, i) => `<li><a href="#/${name}" data-nav="${name}">${icon(VIEWS[name].icon, 20)}<span>${VIEWS[name].label}</span><kbd>${i + 1}</kbd></a></li>`).join('')}
  </ul>
  <button type="button" class="rail__add" data-add aria-label="Nuevo">${icon('plus', 24)}</button>
  <div class="rail__sync" data-sync></div>`;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, query = ''] = raw.split('?');
  return { name: VIEWS[name] ? name : 'hoy', params: Object.fromEntries(new URLSearchParams(query)) };
}

function route() {
  const { name, params } = parseHash();
  const hasParams = Object.keys(params).length > 0;
  if (name === currentName && !hasParams) return;
  if (sheetOpen()) closeSheet();
  current?.unmount?.();
  currentName = name;
  // Cada vista se monta en un contenedor nuevo: así sus escuchas de eventos se van con ella.
  const el = document.createElement('div');
  el.className = `view view--${name}`;
  viewEl.replaceChildren(el);
  document.title = `${VIEWS[name].label} · Claqueta`;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  current = VIEWS[name].mod.mount(el, params);
  enter(el);
  if (hasParams) history.replaceState(null, '', `#/${name}`);
}

window.addEventListener('hashchange', route);

// "Saltar al contenido" mueve el foco sin tocar la ruta (que vive en el #).
document.querySelector('.skip').addEventListener('click', (e) => {
  e.preventDefault();
  viewEl.focus();
});

// El "+" del celular crea lo que tiene sentido en cada pantalla.
$('#rail').addEventListener('click', (e) => {
  if (!e.target.closest('[data-add]')) return;
  if (currentName === 'calendario') current?.newEvent?.();
  else newVideo();
});

/* ---------- Estado de Google en la barra ---------- */

function drawSync() {
  const s = syncStatus();
  const box = $('[data-sync]');
  const dotAjustes = document.querySelector('[data-nav="ajustes"]');
  dotAjustes?.classList.toggle('has-alert', s.phase === 'expired' || s.phase === 'error');
  if (s.phase === 'unconfigured' || s.phase === 'disconnected') {
    box.innerHTML = `<a class="sync sync--off" href="#/ajustes">${icon('calendar', 16)}<span>Conectar Google Calendar</span></a>`;
  } else if (s.phase === 'expired') {
    box.innerHTML = `<button type="button" class="sync sync--alert" data-sync-act="connect">${icon('warn', 16)}<span>Reconectar Google</span></button>`;
  } else if (s.phase === 'syncing') {
    box.innerHTML = `<span class="sync is-syncing">${icon('sync', 16)}<span>Sincronizando…</span></span>`;
  } else if (s.phase === 'error') {
    box.innerHTML = `<button type="button" class="sync sync--alert" data-sync-act="sync" title="${esc(s.message)}">${icon('warn', 16)}<span>${s.offline ? 'Sin conexión' : 'No se sincronizó'} · Reintentar</span></button>`;
  } else {
    box.innerHTML = `<button type="button" class="sync" data-sync-act="sync" title="Sincronizar ahora">${icon('sync', 16)}<span>Sincronizado ${esc(ago(s.lastSync))}</span></button>`;
  }
}

$('[data-sync]').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-sync-act]')?.dataset.syncAct;
  if (act === 'sync') syncNow();
  else if (act === 'connect') {
    try {
      await connect();
      toast('Google reconectado');
    } catch (err) {
      toast(err.message, { tone: 'error', ms: 8000 });
    }
  }
});

onSync(drawSync);
setInterval(drawSync, 60 * 1000);

/* ---------- Datos ↔ vistas ↔ sincronización ---------- */

let warnedStorage = false;
store.subscribe((meta) => {
  current?.update?.(meta);
  if (meta.saved === false && !warnedStorage) {
    warnedStorage = true;
    toast('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). Descarga una copia desde Ajustes.', { tone: 'error', ms: 10000 });
  }
  if (meta.type === 'local') drawSync();
  else if (meta.source !== 'sync') scheduleSync();
});

window.addEventListener('storage', (e) => {
  if (e.key === store.DATA_KEY) store.reload();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  drawSync();
  if (isConnected() && Date.now() - store.local.lastSync > 60 * 1000) syncNow();
});
setInterval(() => !document.hidden && isConnected() && syncNow(), 5 * 60 * 1000);
window.addEventListener('online', () => isConnected() && syncNow());

/* ---------- Atajos ---------- */

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || sheetOpen()) return;
  const t = e.target;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'n') {
    e.preventDefault();
    newVideo();
  } else if (k === 'e') {
    e.preventDefault();
    if (currentName === 'calendario') current?.newEvent?.();
    else newEvent();
  } else if (k === '/') {
    e.preventDefault();
    if (currentName !== 'videos') location.hash = '#/videos';
    requestAnimationFrame(() => current?.focusSearch?.());
  } else if (/^[1-4]$/.test(k)) {
    location.hash = `#/${ORDER[Number(k) - 1]}`;
  }
});

/* ---------- Inicio ---------- */

applyTheme();
route();
drawSync();
requestAnimationFrame(() => setTimeout(clap, 350));
preload();
if (isConnected()) setTimeout(syncNow, 1200);
