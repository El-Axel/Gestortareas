// Sincronización con Google. Un ciclo hace, en orden:
//   1. Drive: baja la copia compartida y la mezcla con lo local (gana el cambio más reciente).
//   2. Calendar: sube eventos y entregas nuevos o cambiados.
//   3. Calendar: baja los eventos del rango visible (los cambios hechos en el celular entran aquí).
//   4. Drive: sube el resultado si cambió.

import { store } from '../store.js';
import { token, requestToken, signOut, AuthError, loadGis } from './auth.js';
import * as gcal from './calendar.js';
import * as drive from './drive.js';
import { remoteEvents, setRemoteEvents, removeRemote, clearRemote } from './remote.js';
import { today, addDays, parseYmd, hash, canonical } from '../util.js';

const subs = new Set();
const state = { running: false, error: '', offline: false };
let queued = false;
let timer = null;
let lastUploaded = '';

export const onSync = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
const notify = () => subs.forEach((fn) => fn(status()));

/** Estado para pintar en la interfaz. */
export function status() {
  if (!store.clientId) return { phase: 'unconfigured' };
  if (!token()) return { phase: store.local.connectedOnce ? 'expired' : 'disconnected' };
  if (state.running) return { phase: 'syncing' };
  if (state.error) return { phase: 'error', message: state.error, offline: state.offline };
  return { phase: 'ok', lastSync: store.local.lastSync };
}

export const isConnected = () => !!token();

export async function connect() {
  await requestToken();
  state.error = '';
  notify();
  await refreshCalendars();
  await syncNow();
}

export function disconnect() {
  signOut();
  clearRemote();
  lastUploaded = '';
  state.error = '';
  notify();
  store.emit({ type: 'all', source: 'sync' });
}

export function preload() {
  if (store.clientId) loadGis().catch(() => {});
}

export async function refreshCalendars() {
  if (!token() || !store.local.granted.list) return;
  try {
    const calendars = await gcal.listCalendars();
    const primary = calendars.find((c) => c.primary);
    store.setLocal({ calendars, loginHint: primary && primary.id.includes('@') ? primary.id : store.local.loginHint });
  } catch (e) {
    if (e instanceof AuthError) notify();
  }
}

export function scheduleSync(ms = 2500) {
  if (!token()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

export async function syncNow() {
  if (!token()) {
    notify();
    return;
  }
  if (state.running) {
    queued = true;
    return;
  }
  clearTimeout(timer);
  state.running = true;
  notify();
  try {
    let changed = false;
    let remoteJson = null;
    const useDrive = store.local.drive && store.local.granted.drive;
    if (useDrive) {
      const res = await drivePull();
      changed = res.changed || changed;
      remoteJson = res.remoteJson;
    }
    changed = (await pushCalendar()) || changed;
    changed = (await pullCalendar()) || changed;
    if (useDrive) await drivePush(remoteJson);
    store.setLocal({ lastSync: Date.now() }, { silent: true });
    state.error = '';
    state.offline = false;
    if (changed) store.emit({ type: 'all', source: 'sync' });
  } catch (e) {
    if (!(e instanceof AuthError)) {
      state.error = e.message || 'No se pudo sincronizar.';
      state.offline = !!e.offline;
    }
    store.emit({ type: 'all', source: 'sync' });
  } finally {
    state.running = false;
    notify();
    if (queued) {
      queued = false;
      scheduleSync(800);
    }
  }
}

/* ---------- Drive ---------- */

const TOMBSTONE_DAYS = 60;

function syncPayload() {
  const cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
  const keep = (r) => !r.sample && !(r.deleted && !r.gcal && r.updatedAt < cutoff);
  const d = store.data;
  return { version: 1, videos: d.videos.filter(keep), events: d.events.filter(keep), settings: d.settings };
}

function pick(a, b) {
  if ((b.updatedAt || 0) !== (a.updatedAt || 0)) return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
  if ((b.gcalRev || 0) !== (a.gcalRev || 0)) return (b.gcalRev || 0) > (a.gcalRev || 0) ? b : a;
  return !a.gcal && b.gcal ? b : a;
}

function mergeLists(local, remote) {
  const map = new Map(local.map((r) => [r.id, r]));
  (remote || []).forEach((r) => {
    if (!r || !r.id) return;
    const mine = map.get(r.id);
    map.set(r.id, mine ? pick(mine, r) : r);
  });
  return [...map.values()];
}

export function mergeData(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  return {
    version: 1,
    videos: mergeLists(local.videos, remote.videos),
    events: mergeLists(local.events, remote.events),
    settings: (remote.settings?.updatedAt || 0) > (local.settings?.updatedAt || 0) ? { ...local.settings, ...remote.settings } : local.settings,
  };
}

async function drivePull() {
  let fileId = store.local.driveFileId;
  if (!fileId) {
    fileId = await drive.findFile();
    if (fileId) store.setLocal({ driveFileId: fileId }, { silent: true });
  }
  if (!fileId) return { changed: false, remoteJson: null };

  let remote;
  try {
    remote = await drive.download(fileId);
  } catch (e) {
    if (e.status === 404) {
      store.setLocal({ driveFileId: '' }, { silent: true });
      return { changed: false, remoteJson: null };
    }
    throw e;
  }
  if (!remote) return { changed: false, remoteJson: null };

  const before = canonical(store.data);
  const merged = mergeData(store.data, remote);
  if (canonical(merged) === before) return { changed: false, remoteJson: canonical(remote) };
  store.replaceData(merged, { source: 'sync' });
  return { changed: true, remoteJson: canonical(remote) };
}

async function drivePush(remoteJson) {
  const json = canonical(syncPayload());
  if (json === remoteJson || json === lastUploaded) return;
  const fileId = store.local.driveFileId;
  if (fileId) {
    await drive.update(fileId, json);
  } else {
    const id = await drive.create(json);
    store.setLocal({ driveFileId: id }, { silent: true });
  }
  lastUploaded = json;
}

/* ---------- Calendar: subir ---------- */

const gone = (e) => e.status === 404 || e.status === 410;

function googleId(kind, rec) {
  // Id fijo por registro: si dos dispositivos intentan crear el mismo evento, Google rechaza el segundo en vez de duplicarlo.
  return `clq${kind === 'video' ? 'v' : 'e'}${rec.id}${rec.gcalRev ? `r${rec.gcalRev}` : ''}`.toLowerCase();
}

async function pushOne(kind, rec, want, makePayload) {
  const g = rec.gcal;
  if (!want) {
    if (!g?.id) return false;
    try {
      await gcal.deleteEvent(g.cal, g.id);
    } catch (e) {
      if (!gone(e)) throw e;
    }
    rec.gcal = null;
    rec.gcalRev = (rec.gcalRev || 0) + 1;
    return true;
  }

  const payload = makePayload(rec);
  const h = hash(payload);
  if (g?.id) {
    if (g.hash === h) return false;
    try {
      const res = await gcal.patchEvent(g.cal, g.id, payload);
      rec.gcal = { ...g, hash: h, updated: Date.parse(res.updated) || Date.now() };
      return true;
    } catch (e) {
      if (!gone(e)) throw e;
      rec.gcal = null;
      rec.gcalRev = (rec.gcalRev || 0) + 1;
    }
  }

  const calId = store.settings.calendarId || 'primary';
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = googleId(kind, rec);
    try {
      const res = await gcal.insertEvent(calId, { id, ...payload });
      rec.gcal = { id: res.id || id, cal: calId, hash: h, updated: Date.parse(res.updated) || Date.now() };
      if (res.htmlLink) rec.htmlLink = res.htmlLink;
      return true;
    } catch (e) {
      if (e.status !== 409) throw e;
      try {
        // Ya existe (lo creó otro dispositivo): se actualiza.
        const res = await gcal.patchEvent(calId, id, { ...payload, status: 'confirmed' });
        rec.gcal = { id, cal: calId, hash: h, updated: Date.parse(res.updated) || Date.now() };
        return true;
      } catch (e2) {
        if (!gone(e2) && e2.status !== 403 && e2.status !== 400) throw e2;
        rec.gcalRev = (rec.gcalRev || 0) + 1; // ese id quedó quemado: se prueba con uno nuevo
      }
    }
  }
  return false;
}

async function pushCalendar() {
  const { data, settings } = store;
  let changed = false;
  for (const e of data.events) {
    if (e.sample) continue;
    const want = !e.deleted && !!e.date;
    changed = (await pushOne('event', e, want, gcal.eventPayload)) || changed;
  }
  for (const v of data.videos) {
    if (v.sample) continue;
    const want = settings.pushDeliveries && !v.deleted && !!v.due;
    changed = (await pushOne('video', v, want, gcal.videoPayload)) || changed;
  }
  return changed;
}

/* ---------- Calendar: bajar ---------- */

const isoAt = (dateStr) => parseYmd(dateStr).toISOString();

async function pullCalendar() {
  const { data, settings, local } = store;
  const writeCal = settings.calendarId || 'primary';
  const cals = [...new Set([writeCal, ...(settings.showCalendars || [])])];
  const timeMin = isoAt(addDays(today(), -45));
  const timeMax = isoAt(addDays(today(), 270));

  const eventsByG = new Map(data.events.filter((e) => e.gcal?.id).map((e) => [e.gcal.id, e]));
  const videosByG = new Map(data.videos.filter((v) => v.gcal?.id).map((v) => [v.gcal.id, v]));
  const remote = [];
  const now = Date.now();
  let changed = false;

  for (const calId of cals) {
    let items;
    try {
      items = await gcal.listEvents(calId, timeMin, timeMax);
    } catch (e) {
      if (gone(e) || e.status === 403) continue; // calendario que ya no existe o sin permiso
      throw e;
    }
    const meta = local.calendars.find((c) => c.id === calId || (calId === 'primary' && c.primary));
    const canEdit = !meta || meta.role === 'owner' || meta.role === 'writer';

    for (const r of items) {
      const updated = Date.parse(r.updated) || 0;
      const le = eventsByG.get(r.id);
      const lv = videosByG.get(r.id);

      if (le) {
        if (le.deleted) continue;
        if (r.status === 'cancelled') {
          // Lo borraste desde Google: también se va de aquí.
          le.deleted = true;
          le.updatedAt = now;
          le.gcal = null;
          le.gcalRev = (le.gcalRev || 0) + 1;
          changed = true;
        } else if (updated > (le.gcal.updated || 0) && hash(gcal.eventPayload(le)) === le.gcal.hash) {
          Object.assign(le, gcal.fromGoogle(r), { updatedAt: now });
          le.gcal = { ...le.gcal, hash: hash(gcal.eventPayload(le)), updated };
          changed = true;
        }
        continue;
      }

      if (lv) {
        if (lv.deleted || r.status === 'cancelled') continue;
        if (updated > (lv.gcal.updated || 0) && hash(gcal.videoPayload(lv)) === lv.gcal.hash) {
          // Moviste la entrega en el calendario del celular: la fecha del video la sigue.
          const g = gcal.fromGoogle(r);
          const dueTime = g.allDay ? '' : g.start;
          if (g.date !== lv.due || dueTime !== (lv.dueTime || '')) {
            lv.due = g.date;
            lv.dueTime = dueTime;
            lv.updatedAt = now;
            changed = true;
          }
          lv.gcal = { ...lv.gcal, hash: hash(gcal.videoPayload(lv)), updated };
        }
        continue;
      }

      if (r.status === 'cancelled' || r.eventType === 'workingLocation' || !r.start) continue;
      remote.push({
        ...gcal.fromGoogle(r),
        id: `g:${r.id}`,
        gid: r.id,
        cal: calId,
        calName: meta?.name || '',
        canEdit,
        htmlLink: r.htmlLink || '',
        updated,
      });
    }
  }

  if (canonical(remote) !== canonical(remoteEvents())) {
    setRemoteEvents(remote);
    changed = true;
  }
  return changed;
}

/** Convierte un evento de Google en uno propio para poder editarlo desde Claqueta. */
export function adoptRemote(remote) {
  const { id, gid, cal, calName, canEdit, htmlLink, updated, ...fields } = remote;
  const ev = store.addEvent({ ...fields, htmlLink }, { source: 'sync' });
  ev.gcal = { id: gid, cal, hash: hash(gcal.eventPayload(ev)), updated };
  removeRemote(id);
  return ev;
}
