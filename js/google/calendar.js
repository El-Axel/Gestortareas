// Google Calendar API v3: llamadas y traducción entre los eventos de Claqueta y los de Google.

import { gfetch } from './auth.js';
import { STATUS } from '../model.js';
import { addDays, ymd, pad, hmToMin, minToHm } from '../util.js';

const API = 'https://www.googleapis.com/calendar/v3';
const cal = (id) => `${API}/calendars/${encodeURIComponent(id)}/events`;

export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/* ---------- Llamadas ---------- */

export async function listCalendars() {
  const out = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ maxResults: '250', ...(pageToken ? { pageToken } : {}) });
    const page = await gfetch(`${API}/users/me/calendarList?${q}`);
    (page.items || []).forEach((c) =>
      out.push({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary, role: c.accessRole, color: c.backgroundColor || '' }),
    );
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return out;
}

export async function listEvents(calendarId, timeMin, timeMax) {
  const out = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', showDeleted: 'true', maxResults: '2500', ...(pageToken ? { pageToken } : {}) });
    const page = await gfetch(`${cal(calendarId)}?${q}`);
    out.push(...(page.items || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return out;
}

// Al crear no se pueden mandar campos en null; al actualizar sirven para borrar el campo anterior.
const stripNulls = (o) =>
  Array.isArray(o) || !o || typeof o !== 'object' ? o : Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNulls(v)]));

export const insertEvent = (calendarId, payload) => gfetch(cal(calendarId), { method: 'POST', json: stripNulls(payload) });
export const patchEvent = (calendarId, eventId, payload) => gfetch(`${cal(calendarId)}/${encodeURIComponent(eventId)}`, { method: 'PATCH', json: payload });
export const deleteEvent = (calendarId, eventId) => gfetch(`${cal(calendarId)}/${encodeURIComponent(eventId)}`, { method: 'DELETE', as: 'none' });

/* ---------- Claqueta → Google ---------- */

function range({ date, endDate, allDay, start, end }) {
  const last = endDate && endDate > date ? endDate : date;
  if (allDay) {
    return {
      start: { date, dateTime: null, timeZone: null },
      end: { date: addDays(last, 1), dateTime: null, timeZone: null }, // en Google el fin de un día completo es exclusivo
    };
  }
  const s = start || '09:00';
  let e = end;
  if (!e || (last === date && hmToMin(e) <= hmToMin(s))) e = minToHm(hmToMin(s) + 60);
  const tz = timeZone();
  return {
    start: { date: null, dateTime: `${date}T${s}:00`, timeZone: tz },
    end: { date: null, dateTime: `${last}T${e}:00`, timeZone: tz },
  };
}

export function eventPayload(e) {
  return {
    summary: e.title || 'Sin título',
    location: e.location || '',
    description: e.notes || '',
    ...range(e),
    extendedProperties: { private: { claquetaType: e.type || 'otro', claquetaClient: e.client || '' } },
  };
}

export function videoPayload(v) {
  const title = v.title || 'Video sin título';
  const done = v.status === 'entregado';
  const who = v.client ? ` (${v.client})` : '';
  const lines = [`Estado: ${STATUS[v.status]?.label || v.status}`];
  if (v.notes) lines.push(v.notes);
  lines.push(`Abrir en Claqueta: ${location.origin}${location.pathname}#/videos?v=${v.id}`);
  return {
    summary: done ? `✓ Entregado: ${title}${who}` : `Entrega: ${title}${who}`,
    location: '',
    description: lines.join('\n\n'),
    ...range({ date: v.due, endDate: '', allDay: !v.dueTime, start: v.dueTime, end: v.dueTime ? minToHm(hmToMin(v.dueTime) + 30) : '' }),
    extendedProperties: { private: { claquetaType: 'entrega', claquetaClient: v.client || '' } },
  };
}

/* ---------- Google → Claqueta ---------- */

const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function guessType(summary = '') {
  if (/grabaci|rodaje|filmaci|shoot|sesi[oó]n/i.test(summary)) return 'grabacion';
  if (/reuni|llamada|call|meet|zoom/i.test(summary)) return 'reunion';
  return 'otro';
}

export function fromGoogle(r) {
  const allDay = !!r.start?.date;
  let date;
  let endDate;
  let start = '09:00';
  let end = '10:00';
  if (allDay) {
    date = r.start.date;
    endDate = addDays(r.end?.date || addDays(date, 1), -1);
  } else {
    const s = new Date(r.start?.dateTime);
    const e = new Date(r.end?.dateTime || r.start?.dateTime);
    date = ymd(s);
    endDate = ymd(e);
    start = hm(s);
    end = hm(e);
  }
  if (!(endDate > date)) endDate = '';
  const priv = r.extendedProperties?.private || {};
  const known = ['grabacion', 'evento', 'reunion', 'otro'];
  return {
    title: r.summary || '',
    location: r.location || '',
    notes: r.description || '',
    date,
    endDate,
    allDay,
    start,
    end,
    type: known.includes(priv.claquetaType) ? priv.claquetaType : guessType(r.summary),
    client: priv.claquetaClient || '',
  };
}
