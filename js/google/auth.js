// Inicio de sesión con Google Identity Services (modelo de token, sin servidor).
// El token dura ~1 hora y Google no da "refresh token" a una web sin backend:
// cuando caduca, la app muestra "Reconectar" y con un clic se renueva.

import { store } from '../store.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const SCOPE = {
  calendar: 'https://www.googleapis.com/auth/calendar.events',
  list: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  drive: 'https://www.googleapis.com/auth/drive.appdata',
};

export class AuthError extends Error {
  constructor(message = 'La sesión de Google caducó.') {
    super(message);
    this.name = 'AuthError';
  }
}

let gisPromise = null;

export function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        s.remove();
        reject(new Error('No se pudo cargar Google. Revisa tu conexión o desactiva el bloqueador de anuncios en este sitio.'));
      };
      document.head.append(s);
    });
  }
  return gisPromise;
}

export function token() {
  const t = store.local.token;
  return t && t.expiresAt > Date.now() ? t.value : null;
}

const noGrants = () => ({ calendar: false, list: false, drive: false });

/** Abre la ventana de Google. Debe llamarse desde un clic del usuario. */
export async function requestToken() {
  const clientId = store.clientId;
  if (!clientId) throw new Error('Falta el ID de cliente de Google. Añádelo en Ajustes.');
  await loadGis();

  const scopes = [SCOPE.calendar, SCOPE.list];
  if (store.local.drive) scopes.push(SCOPE.drive);

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(' '),
      login_hint: store.local.loginHint || undefined,
      callback: (resp) => {
        if (!resp || resp.error) {
          reject(new Error(resp?.error === 'access_denied' ? 'No diste permiso a Claqueta en la ventana de Google.' : resp?.error_description || resp?.error || 'Google no respondió.'));
          return;
        }
        const has = (s) => window.google.accounts.oauth2.hasGrantedAllScopes(resp, s);
        const granted = { calendar: has(SCOPE.calendar), list: has(SCOPE.list), drive: has(SCOPE.drive) };
        if (!granted.calendar) {
          reject(new Error('Falta el permiso de calendario. Vuelve a conectar y deja marcada la casilla de Google Calendar.'));
          return;
        }
        store.setLocal({
          token: { value: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in || 3600) - 90) * 1000 },
          granted,
          connectedOnce: true,
        });
        resolve(granted);
      },
      error_callback: (err) => {
        const msg =
          err?.type === 'popup_closed'
            ? 'Cerraste la ventana de Google antes de terminar.'
            : err?.type === 'popup_failed_to_open'
              ? 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio y vuelve a intentar.'
              : err?.message || 'No se pudo conectar con Google.';
        reject(new Error(msg));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  const t = token();
  try {
    if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
  } catch {
    /* revocar es opcional */
  }
  store.setLocal({ token: null, granted: noGrants(), connectedOnce: false, calendars: [], driveFileId: '', loginHint: '', lastSync: 0 });
}

/** fetch con el token puesto y errores legibles. */
export async function gfetch(url, { method = 'GET', json, body, headers = {}, as = 'json' } = {}) {
  const t = token();
  if (!t) throw new AuthError();
  const init = { method, headers: { Authorization: `Bearer ${t}`, ...headers } };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body;
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch {
    const e = new Error('Sin conexión con Google.');
    e.offline = true;
    throw e;
  }
  if (res.status === 401) {
    store.setLocal({ token: null });
    throw new AuthError();
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      /* cuerpo vacío */
    }
    const e = new Error(detail || `Google respondió ${res.status}`);
    e.status = res.status;
    throw e;
  }
  if (res.status === 204 || as === 'none') return null;
  return as === 'text' ? res.text() : res.json();
}
