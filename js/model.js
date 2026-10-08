// Reglas del dominio: estados, tipos y cálculos sobre videos y eventos.

import { store } from './store.js';
import { remoteEvents } from './google/remote.js';
import { today, ymd, addDays, diffDays, parseYmd, fmtShort, fmtTime, DIAS, cap, hmToMin } from './util.js';

export const STATUSES = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'proceso', label: 'En proceso' },
  { id: 'revision', label: 'En revisión' },
  { id: 'entregado', label: 'Entregado' },
];
export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

/** Verbo del botón que lleva un video a cada estado. */
export const ADVANCE = { proceso: 'Empezar', revision: 'A revisión', entregado: 'Entregar' };

export const PRIORITIES = [
  { id: 'baja', label: 'Baja' },
  { id: 'normal', label: 'Normal' },
  { id: 'alta', label: 'Alta' },
];

export const EVENT_TYPES = [
  { id: 'grabacion', label: 'Grabación', icon: 'camera' },
  { id: 'evento', label: 'Evento', icon: 'star' },
  { id: 'reunion', label: 'Reunión', icon: 'users' },
  { id: 'otro', label: 'Otro', icon: 'dot' },
];
export const EVENT_TYPE = Object.fromEntries(EVENT_TYPES.map((t) => [t.id, t]));

export const VIDEO_TYPES = ['Reel', 'YouTube', 'Boda', 'Corporativo', 'Comercial', 'Videoclip', 'Podcast', 'Evento'];

export function nextStatus(status) {
  const i = STATUSES.findIndex((s) => s.id === status);
  return STATUSES[i + 1] || null;
}

export function progress(v) {
  const total = v.checklist?.length || 0;
  const done = total ? v.checklist.filter((c) => c.done).length : 0;
  return { total, done, ratio: total ? done / total : 0 };
}

/** Cómo se lee la fecha de entrega de un video ahora mismo. */
export function dueInfo(v, now = new Date()) {
  if (!v.due) return { label: 'Sin fecha', tone: 'none', days: null };
  const t = ymd(now);
  const d = diffDays(v.due, t);
  const time = v.dueTime ? ` · ${fmtTime(v.dueTime)}` : '';
  if (v.status === 'entregado') return { label: fmtShort(v.due), tone: 'done', days: d };
  if (d < 0) return { label: d === -1 ? 'Atrasado 1 día' : `Atrasado ${-d} días`, tone: 'late', days: d };
  if (d === 0) {
    const passed = v.dueTime && hmToMin(v.dueTime) < now.getHours() * 60 + now.getMinutes();
    return passed ? { label: `Atrasado · hoy${time.replace(' ·', '')}`, tone: 'late', days: 0 } : { label: `Hoy${time}`, tone: 'today', days: 0 };
  }
  if (d === 1) return { label: `Mañana${time}`, tone: 'soon', days: 1 };
  if (d <= 6) return { label: `${cap(DIAS[parseYmd(v.due).getDay()])}${time}`, tone: d <= 2 ? 'soon' : 'normal', days: d };
  return { label: fmtShort(v.due), tone: 'normal', days: d };
}

/** 'en 3 días', 'en 5 h', 'hace 2 días' — para la lista de lo próximo. */
export function countdown(v, now = new Date()) {
  if (!v.due) return '';
  const end = parseYmd(v.due);
  if (v.dueTime) {
    const [h, m] = v.dueTime.split(':').map(Number);
    end.setHours(h, m, 0, 0);
  } else {
    end.setHours(23, 59, 0, 0);
  }
  const ms = end - now;
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 36e5);
  const days = Math.abs(diffDays(v.due, ymd(now)));
  let text;
  if (days === 0) text = hours < 1 ? 'menos de 1 h' : `${hours} h`;
  else text = days === 1 ? '1 día' : `${days} días`;
  return ms < 0 ? `hace ${text}` : `en ${text}`;
}

const PRIORITY_RANK = { alta: 0, normal: 1, baja: 2 };

export function sortVideos(list, sort) {
  const arr = [...list];
  if (sort === 'due') {
    arr.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.dueTime || '99').localeCompare(b.dueTime || '99') || a.order - b.order);
  } else if (sort === 'priority') {
    arr.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due || '9999').localeCompare(b.due || '9999'));
  } else {
    arr.sort((a, b) => a.order - b.order);
  }
  return arr;
}

export function activeVideos() {
  return store.videos().filter((v) => v.status !== 'entregado');
}

export function clients() {
  const set = new Set();
  store.videos().forEach((v) => v.client && set.add(v.client.trim()));
  store.events().forEach((e) => e.client && set.add(e.client.trim()));
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

export function videoTypes() {
  const set = new Set(VIDEO_TYPES);
  store.videos().forEach((v) => v.type && set.add(v.type.trim()));
  return [...set];
}

export function eventDays(e) {
  const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
  const out = [];
  for (let d = e.date, i = 0; d <= end && i < 60; d = addDays(d, 1), i++) out.push(d);
  return out;
}

export function eventTimeLabel(e) {
  if (e.allDay) return 'Todo el día';
  return e.end ? `${fmtTime(e.start)} – ${fmtTime(e.end)}` : fmtTime(e.start);
}

/**
 * Todo lo que cae en cada día entre `from` y `to`: entregas, eventos propios y eventos de Google.
 * Devuelve Map<'AAAA-MM-DD', item[]> ya ordenado.
 */
export function dayItems(from, to) {
  const map = new Map();
  const push = (date, item) => {
    if (date < from || date > to) return;
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(item);
  };

  store.videos().forEach((v) => {
    if (!v.due) return;
    push(v.due, {
      kind: 'video',
      id: v.id,
      title: v.title || 'Video sin título',
      time: v.dueTime || '',
      allDay: !v.dueTime,
      status: v.status,
      late: dueInfo(v).tone === 'late',
      sub: v.client,
    });
  });

  const addEvent = (e, kind) => {
    eventDays(e).forEach((date, i, all) => {
      push(date, {
        kind,
        id: e.id,
        title: e.title || 'Sin título',
        time: e.allDay ? '' : i === 0 ? e.start : '',
        endTime: e.allDay ? '' : e.end,
        allDay: e.allDay || i > 0,
        type: e.type || 'otro',
        sub: e.location || e.client || '',
        span: all.length > 1 ? `${i + 1}/${all.length}` : '',
        calName: e.calName || '',
      });
    });
  };
  store.events().forEach((e) => e.date && addEvent(e, 'event'));
  remoteEvents().forEach((e) => addEvent(e, 'remote'));

  map.forEach((items) => items.sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'es')));
  return map;
}

/** Resumen en una frase para la portada. */
export function summary() {
  const t = today();
  const vids = activeVideos();
  const late = vids.filter((v) => dueInfo(v).tone === 'late').length;
  const week = vids.filter((v) => v.due && diffDays(v.due, t) >= 0 && diffDays(v.due, t) <= 6).length;
  const items = dayItems(t, addDays(t, 1));
  const shootsToday = (items.get(t) || []).filter((i) => i.kind !== 'video' && i.type === 'grabacion').length;
  const shootsTomorrow = (items.get(addDays(t, 1)) || []).filter((i) => i.kind !== 'video' && i.type === 'grabacion').length;
  return { late, week, shootsToday, shootsTomorrow, active: vids.length };
}

export function unpaid() {
  const list = store.videos().filter((v) => v.price && !v.paid);
  return { count: list.length, total: list.reduce((s, v) => s + Number(v.price || 0), 0) };
}

export function deliveredThisMonth() {
  const now = new Date();
  return store.videos().filter((v) => {
    if (v.status !== 'entregado' || !v.deliveredAt) return false;
    const d = new Date(v.deliveredAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
}
