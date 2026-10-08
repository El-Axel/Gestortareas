// Utilidades pequeñas y sin dependencias: DOM, fechas, formato.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

/* ---------- Fechas (siempre 'AAAA-MM-DD' en hora local) ---------- */

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Días de diferencia a − b. */
export function diffDays(a, b) {
  return Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
}

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** '8 oct' (añade el año si no es el actual). */
export function fmtShort(s) {
  const d = parseYmd(s);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}${y}`;
}

/** 'jueves 8 de octubre' */
export function fmtLong(s) {
  const d = parseYmd(s);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** '14:30' → '2:30 pm' */
export function fmtTime(hm) {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

export function hmToMin(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHm(min) {
  const m = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function money(n, currency = 'COP') {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n));
  } catch {
    return `$${Number(n).toLocaleString('es-CO')}`;
  }
}

/** 'hace 3 min', 'hace 2 h', 'ayer'… para marcas de tiempo. */
export function ago(ts) {
  if (!ts) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fmtShort(ymd(new Date(ts)));
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** JSON con claves ordenadas: sirve para comparar y para firmar contenidos. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hash(value) {
  const s = typeof value === 'string' ? value : canonical(value);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return ''; // nada de javascript:, data:, etc.
  return `https://${s}`;
}
