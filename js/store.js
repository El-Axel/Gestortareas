// Estado de la app. Todo vive en localStorage de este navegador;
// si conectas Google, sync.js lo replica en tu Drive y en tu calendario.

import { uid } from './util.js';
import { GOOGLE_CLIENT_ID } from '../config.js';

const DATA_KEY = 'claqueta:data:v1';
const LOCAL_KEY = 'claqueta:local:v1';

const defaultSettings = () => ({
  currency: 'COP',
  checklist: ['Organizar material', 'Corte', 'Color', 'Sonido y música', 'Subtítulos', 'Exportar'],
  calendarId: 'primary',
  showCalendars: [],
  pushDeliveries: true,
  updatedAt: 0,
});

// Preferencias que NO se sincronizan: son de este dispositivo.
const defaultLocal = () => ({
  theme: 'dark',
  clientId: '',
  token: null,
  granted: { calendar: false, list: false, drive: false },
  connectedOnce: false,
  loginHint: '',
  drive: true,
  driveFileId: '',
  lastSync: 0,
  calendars: [],
  videos: { mode: 'board', sort: 'manual', tab: 'pendiente' },
  cal: { mode: 'mes' },
});

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function normalizeData(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    version: 1,
    videos: Array.isArray(d.videos) ? d.videos.filter((v) => v && v.id) : [],
    events: Array.isArray(d.events) ? d.events.filter((e) => e && e.id) : [],
    settings: { ...defaultSettings(), ...(d.settings || {}) },
  };
}

let data = normalizeData(read(DATA_KEY));
const savedLocal = read(LOCAL_KEY) || {};
let local = {
  ...defaultLocal(),
  ...savedLocal,
  videos: { ...defaultLocal().videos, ...(savedLocal.videos || {}) },
  cal: { ...defaultLocal().cal, ...(savedLocal.cal || {}) },
  granted: { ...defaultLocal().granted, ...(savedLocal.granted || {}) },
};

const subs = new Set();

function blankVideo() {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    client: '',
    type: '',
    status: 'pendiente',
    priority: 'normal',
    due: '',
    dueTime: '',
    price: null,
    paid: false,
    notes: '',
    linkMaterial: '',
    linkEntrega: '',
    checklist: [],
    order: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: 0,
    deliveredAt: 0,
  };
}

function blankEvent() {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    type: 'grabacion',
    date: '',
    endDate: '',
    allDay: false,
    start: '09:00',
    end: '10:00',
    location: '',
    client: '',
    videoId: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

export const store = {
  get data() {
    return data;
  },
  get local() {
    return local;
  },
  get settings() {
    return data.settings;
  },
  /** ID de cliente de Google: el de Ajustes tiene prioridad sobre config.js. */
  get clientId() {
    return (local.clientId || GOOGLE_CLIENT_ID || '').trim();
  },

  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  emit(meta = {}) {
    const ok = write(DATA_KEY, data);
    subs.forEach((fn) => fn({ ...meta, saved: ok }));
  },

  /* ---------- Videos ---------- */
  videos() {
    return data.videos.filter((v) => !v.deleted);
  },
  video(id) {
    return data.videos.find((v) => v.id === id && !v.deleted);
  },
  topOrder(status) {
    const orders = data.videos.filter((v) => !v.deleted && v.status === status).map((v) => v.order);
    return orders.length ? Math.min(...orders) - 1 : 0;
  },
  addVideo(partial = {}, meta = {}) {
    const v = { ...blankVideo(), ...partial };
    if (partial.order == null) v.order = this.topOrder(v.status);
    data.videos.push(v);
    this.emit({ type: 'video', id: v.id, ...meta });
    return v;
  },
  updateVideo(id, patch, meta = {}) {
    const v = data.videos.find((x) => x.id === id);
    if (!v) return null;
    const now = Date.now();
    const next = { ...patch };
    if (next.status && next.status !== v.status) {
      next.deliveredAt = next.status === 'entregado' ? now : 0;
      if (next.status !== 'pendiente' && !v.startedAt) next.startedAt = now;
      if (next.order == null) next.order = this.topOrder(next.status);
    }
    Object.assign(v, next, { updatedAt: now });
    this.emit({ type: 'video', id, ...meta });
    return v;
  },
  removeVideo(id) {
    const v = data.videos.find((x) => x.id === id);
    if (!v) return;
    v.deleted = true;
    v.updatedAt = Date.now();
    this.emit({ type: 'video', id });
  },
  restoreVideo(id) {
    const v = data.videos.find((x) => x.id === id);
    if (!v) return;
    delete v.deleted;
    v.updatedAt = Date.now();
    this.emit({ type: 'video', id });
  },
  /** Borra sin dejar rastro (solo para borradores vacíos que nunca salieron de aquí). */
  purgeVideo(id) {
    data.videos = data.videos.filter((v) => v.id !== id);
    this.emit({ type: 'video', id });
  },

  /* ---------- Eventos ---------- */
  events() {
    return data.events.filter((e) => !e.deleted);
  },
  event(id) {
    return data.events.find((e) => e.id === id && !e.deleted);
  },
  addEvent(partial = {}, meta = {}) {
    const e = { ...blankEvent(), ...partial };
    data.events.push(e);
    this.emit({ type: 'event', id: e.id, ...meta });
    return e;
  },
  updateEvent(id, patch, meta = {}) {
    const e = data.events.find((x) => x.id === id);
    if (!e) return null;
    Object.assign(e, patch, { updatedAt: Date.now() });
    this.emit({ type: 'event', id, ...meta });
    return e;
  },
  removeEvent(id) {
    const e = data.events.find((x) => x.id === id);
    if (!e) return;
    e.deleted = true;
    e.updatedAt = Date.now();
    this.emit({ type: 'event', id });
  },
  restoreEvent(id) {
    const e = data.events.find((x) => x.id === id);
    if (!e) return;
    delete e.deleted;
    e.updatedAt = Date.now();
    this.emit({ type: 'event', id });
  },
  purgeEvent(id) {
    data.events = data.events.filter((e) => e.id !== id);
    this.emit({ type: 'event', id });
  },

  /* ---------- Ajustes ---------- */
  setSettings(patch, meta = {}) {
    Object.assign(data.settings, patch, { updatedAt: Date.now() });
    this.emit({ type: 'settings', ...meta });
  },
  setLocal(patch, { silent = false } = {}) {
    local = { ...local, ...patch };
    write(LOCAL_KEY, local);
    if (!silent) subs.forEach((fn) => fn({ type: 'local', source: 'local' }));
  },

  /** Otra pestaña guardó cambios: se vuelven a leer. */
  reload() {
    data = normalizeData(read(DATA_KEY));
    subs.forEach((fn) => fn({ type: 'all', source: 'sync', saved: true }));
  },
  DATA_KEY,

  /* ---------- Datos completos ---------- */
  replaceData(next, meta = {}) {
    data = normalizeData(next);
    this.emit({ type: 'all', ...meta });
  },
  clearAll() {
    // Deja "lápidas" para que el borrado también llegue a Google y a otros dispositivos.
    const now = Date.now();
    data.videos.forEach((v) => {
      v.deleted = true;
      v.updatedAt = now;
    });
    data.events.forEach((e) => {
      e.deleted = true;
      e.updatedAt = now;
    });
    this.emit({ type: 'all' });
  },
  hasSamples() {
    return data.videos.some((v) => v.sample && !v.deleted) || data.events.some((e) => e.sample && !e.deleted);
  },
  removeSamples() {
    data.videos = data.videos.filter((v) => !v.sample);
    data.events = data.events.filter((e) => !e.sample);
    this.emit({ type: 'all' });
  },
};
