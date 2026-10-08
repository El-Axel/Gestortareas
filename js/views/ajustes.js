// Vista "Ajustes": Google, apariencia, plantilla de pasos y copia de seguridad.

import { store, normalizeData } from '../store.js';
import { $, esc, ago, today } from '../util.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { segmented } from '../ui/parts.js';
import { applyTheme } from '../theme.js';
import { status as syncStatus, connect, disconnect, syncNow, refreshCalendars, preload, onSync } from '../google/sync.js';
import { GOOGLE_CLIENT_ID } from '../../config.js';

const CURRENCIES = ['COP', 'USD', 'MXN', 'EUR', 'ARS', 'CLP', 'PEN'];

export function mount(el) {
  el.innerHTML = `
    <header class="vh">
      <div><h1 class="vh__title">Ajustes</h1><p class="vh__sub">Conexión con Google, apariencia y tus datos.</p></div>
    </header>
    <div class="settings">
      <section class="set" aria-labelledby="s-google"><h2 class="set__title" id="s-google">Google Calendar</h2><div class="set__body" data-google></div></section>
      <section class="set" aria-labelledby="s-look"><h2 class="set__title" id="s-look">Apariencia</h2><div class="set__body" data-look></div></section>
      <section class="set" aria-labelledby="s-work"><h2 class="set__title" id="s-work">Tu forma de trabajar</h2><div class="set__body" data-work></div></section>
      <section class="set" aria-labelledby="s-data"><h2 class="set__title" id="s-data">Tus datos</h2><div class="set__body" data-data></div></section>
    </div>`;

  let busy = false;
  let wipeArmed = false;
  preload();

  function googleHtml() {
    const s = syncStatus();
    const { local, settings } = store;
    const origin = location.origin;

    if (s.phase === 'unconfigured') {
      return `
        <p class="set__lead">Conecta tu cuenta para que las grabaciones y entregas aparezcan en el calendario de tu celular, y para que lo que agendes en el celular aparezca aquí.</p>
        <p>Google pide que cada app tenga su propio <b>ID de cliente</b>. Se crea una sola vez y es gratis:</p>
        <ol class="steps">
          <li>Entra a <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a> y crea un proyecto (por ejemplo «Claqueta»).</li>
          <li>En <b>APIs y servicios → Biblioteca</b>, habilita <b>Google Calendar API</b> y <b>Google Drive API</b>.</li>
          <li>En <b>APIs y servicios → Pantalla de consentimiento de OAuth</b> pulsa «Comenzar», elige público <b>Externo</b> y, en la pestaña <b>Público</b>, añade tu correo como usuario de prueba.</li>
          <li>En la pestaña <b>Clientes → Crear cliente</b>, tipo <b>Aplicación web</b>. En «Orígenes autorizados de JavaScript» añade exactamente:
            <span class="copyline"><code>${esc(origin)}</code><button type="button" class="btn btn--sm" data-copy="${esc(origin)}">${icon('copy', 15)}Copiar</button></span>
          </li>
          <li>Copia el ID de cliente (termina en <code>.apps.googleusercontent.com</code>) y pégalo aquí:</li>
        </ol>
        <form class="inline-form" data-client-form>
          <label class="sr" for="client-id">ID de cliente de OAuth</label>
          <input id="client-id" type="text" placeholder="1234567890-abc….apps.googleusercontent.com" autocomplete="off" spellcheck="false">
          <button type="submit" class="btn btn--primary">Guardar</button>
        </form>
        <p class="muted">El README del proyecto trae esta guía con más detalle. Para dejarlo fijo en todos tus dispositivos, pégalo también en <code>config.js</code>.</p>`;
    }

    if (s.phase === 'disconnected' || s.phase === 'expired') {
      return `
        <p class="set__lead">${s.phase === 'expired' ? 'La sesión de Google caducó (dura cerca de una hora). Reconecta con un clic: no tendrás que volver a dar permisos.' : 'Todo listo para conectar. Se abrirá una ventana de Google para que elijas tu cuenta.'}</p>
        <div class="row-actions">
          <button type="button" class="btn btn--primary" data-action="connect" ${busy ? 'disabled' : ''}>${icon('calendar')}${s.phase === 'expired' ? 'Reconectar Google' : 'Conectar con Google'}</button>
          <label class="switch"><input type="checkbox" data-local="drive" ${local.drive ? 'checked' : ''}><i></i><span>Sincronizar también mis videos entre dispositivos</span></label>
        </div>
        <p class="muted">Claqueta pide permiso para ver y editar eventos de tu calendario${local.drive ? ' y para guardar una copia de tus datos en una carpeta privada de la app en tu Drive (no ve tus otros archivos)' : ''}.</p>
        ${clientLine()}`;
    }

    const cals = local.calendars || [];
    const writable = cals.filter((c) => c.role === 'owner' || c.role === 'writer');
    const writeId = settings.calendarId || 'primary';
    const isWrite = (c) => c.id === writeId || (writeId === 'primary' && c.primary);
    const stateLine =
      s.phase === 'syncing'
        ? `${icon('sync', 16)}<span>Sincronizando…</span>`
        : s.phase === 'error'
          ? `${icon('warn', 16)}<span class="late">${esc(s.message)}</span>`
          : `${icon('check', 16)}<span>Sincronizado ${esc(ago(s.lastSync))}</span>`;

    return `
      <p class="set__state ${s.phase === 'syncing' ? 'is-syncing' : ''}">${stateLine}${local.loginHint ? `<span class="muted">· ${esc(local.loginHint)}</span>` : ''}</p>
      <div class="row-actions">
        <button type="button" class="btn" data-action="sync" ${s.phase === 'syncing' ? 'disabled' : ''}>${icon('sync')}Sincronizar ahora</button>
        <button type="button" class="btn btn--quiet" data-action="disconnect">Desconectar</button>
      </div>

      ${
        writable.length
          ? `<label class="field"><span class="label">Guardar mis eventos y entregas en</span>
              <select data-setting="calendarId">${writable.map((c) => `<option value="${esc(c.primary ? 'primary' : c.id)}" ${isWrite(c) ? 'selected' : ''}>${esc(c.name)}${c.primary ? ' (principal)' : ''}</option>`).join('')}</select>
            </label>`
          : ''
      }
      ${
        cals.filter((c) => !isWrite(c)).length
          ? `<fieldset class="field"><legend class="label">Mostrar también estos calendarios</legend>
              <div class="checks-list">${cals
                .filter((c) => !isWrite(c))
                .map((c) => `<label class="tick"><input type="checkbox" data-show-cal="${esc(c.id)}" ${settings.showCalendars.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`)
                .join('')}</div>
            </fieldset>`
          : ''
      }
      <label class="switch switch--block"><input type="checkbox" data-setting="pushDeliveries" ${settings.pushDeliveries ? 'checked' : ''}><i></i>
        <span>Poner las fechas de entrega en mi Google Calendar<small>Cada video con fecha crea un evento «Entrega: …». Si lo mueves desde el celular, la fecha cambia aquí.</small></span></label>
      <label class="switch switch--block"><input type="checkbox" data-local="drive" ${local.drive ? 'checked' : ''}><i></i>
        <span>Sincronizar mis videos entre dispositivos<small>${local.drive && !local.granted.drive ? 'Falta el permiso de Drive: desconecta y vuelve a conectar para activarlo.' : 'Guarda una copia en una carpeta privada de la app en tu Drive. Así ves el mismo tablero en el computador y en el celular.'}</small></span></label>
      ${clientLine()}`;
  }

  function clientLine() {
    const fromConfig = !store.local.clientId && GOOGLE_CLIENT_ID;
    return `<p class="muted clientline">ID de cliente: <code>${esc(store.clientId.slice(0, 14))}…</code> ${fromConfig ? '(desde config.js)' : `<button type="button" class="linkbtn" data-action="forget-client">Cambiar</button>`}</p>`;
  }

  function lookHtml() {
    return `
      <div class="field"><span class="label">Tema</span>
        ${segmented(
          'theme',
          [
            { id: 'dark', label: 'Oscuro', icon: 'moon' },
            { id: 'light', label: 'Claro', icon: 'sun' },
            { id: 'system', label: 'Según el sistema' },
          ],
          store.local.theme,
          { label: 'Tema' },
        )}
      </div>`;
  }

  function workHtml() {
    const s = store.settings;
    return `
      <label class="field"><span class="label">Plantilla de pasos para un video</span>
        <textarea data-checklist rows="${Math.max(4, s.checklist.length + 1)}" placeholder="Un paso por línea">${esc(s.checklist.join('\n'))}</textarea>
        <span class="muted">Un paso por línea. En cada video puedes cargarla con «Usar mi plantilla».</span>
      </label>
      <label class="field field--narrow"><span class="label">Moneda</span>
        <select data-setting="currency">${CURRENCIES.map((c) => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </label>`;
  }

  function dataHtml() {
    const n = store.videos().length;
    const m = store.events().length;
    return `
      <p class="set__lead">Tus datos se guardan en este navegador${store.local.drive && store.local.granted.drive ? ' y en tu Drive' : ''}: ${n} ${n === 1 ? 'video' : 'videos'} y ${m} ${m === 1 ? 'evento' : 'eventos'}.</p>
      <div class="row-actions">
        <button type="button" class="btn" data-action="export">${icon('download')}Descargar copia</button>
        <label class="btn">${icon('upload')}Restaurar copia<input type="file" accept="application/json,.json" data-import hidden></label>
        ${store.hasSamples() ? `<button type="button" class="btn" data-action="clear-samples">Quitar datos de ejemplo</button>` : ''}
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn--quiet btn--danger" data-action="wipe">${icon('trash')}${wipeArmed ? 'Sí, borrar todos los videos y eventos' : 'Borrar todo'}</button>
        ${wipeArmed ? `<button type="button" class="btn btn--quiet" data-action="wipe-cancel">Cancelar</button>` : ''}
      </div>`;
  }

  function draw(only) {
    const active = document.activeElement;
    const inside = active && el.contains(active) ? active : null;
    const typing = inside && (inside.tagName === 'TEXTAREA' || (inside.tagName === 'INPUT' && inside.type === 'text'));
    // Para devolver el foco al mismo control después de redibujar.
    const key = inside && ['setting', 'showCal', 'local', 'action'].map((k) => (inside.dataset[k] ? `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${inside.dataset[k]}"]` : '')).find(Boolean);
    const paint = (name, html) => {
      const box = $(`[data-${name}]`, el);
      if (only && only !== name) return;
      if (typing && box.contains(inside)) return;
      box.innerHTML = html();
    };
    paint('google', googleHtml);
    paint('look', lookHtml);
    paint('work', workHtml);
    paint('data', dataHtml);
    if (key && !el.contains(document.activeElement)) el.querySelector(key)?.focus({ preventScroll: true });
  }

  async function run(fn, okMessage) {
    busy = true;
    draw('google');
    try {
      await fn();
      if (okMessage) toast(okMessage);
    } catch (err) {
      toast(err.message || 'Algo falló con Google.', { tone: 'error', ms: 8000 });
    } finally {
      busy = false;
      draw();
    }
  }

  el.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy).then(
        () => toast('Copiado'),
        () => toast('No se pudo copiar: selecciónalo a mano.', { tone: 'error' }),
      );
      return;
    }
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'connect') run(connect, 'Google conectado');
    else if (a === 'sync') syncNow();
    else if (a === 'disconnect') {
      disconnect();
      toast('Google desconectado. Tus datos siguen en este navegador.');
      draw();
    } else if (a === 'forget-client') {
      disconnect();
      store.setLocal({ clientId: '' });
      draw();
    } else if (a === 'export') {
      const blob = new Blob([JSON.stringify({ app: 'claqueta', exportedAt: new Date().toISOString(), ...store.data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: `claqueta-${today()}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (a === 'clear-samples') {
      store.removeSamples();
      toast('Datos de ejemplo eliminados');
    } else if (a === 'wipe') {
      if (!wipeArmed) {
        wipeArmed = true;
        draw('data');
        el.querySelector('[data-action="wipe"]')?.focus();
        return;
      }
      wipeArmed = false;
      store.clearAll();
      toast('Todo borrado');
    } else if (a === 'wipe-cancel') {
      wipeArmed = false;
      draw('data');
    }
  });

  el.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-client-form]')) return;
    e.preventDefault();
    const value = $('#client-id', el).value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(value)) {
      toast('Ese no parece un ID de cliente: debe terminar en .apps.googleusercontent.com', { tone: 'error', ms: 7000 });
      return;
    }
    store.setLocal({ clientId: value });
    preload();
    draw();
  });

  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.name === 'theme') {
      store.setLocal({ theme: t.value }, { silent: true });
      applyTheme();
    } else if (t.dataset.setting === 'calendarId') {
      store.setSettings({ calendarId: t.value, showCalendars: store.settings.showCalendars.filter((id) => id !== t.value) });
    } else if (t.dataset.setting === 'pushDeliveries') {
      store.setSettings({ pushDeliveries: t.checked });
    } else if (t.dataset.setting === 'currency') {
      store.setSettings({ currency: t.value });
    } else if (t.dataset.showCal) {
      const set = new Set(store.settings.showCalendars);
      if (t.checked) set.add(t.dataset.showCal);
      else set.delete(t.dataset.showCal);
      store.setSettings({ showCalendars: [...set] });
    } else if (t.dataset.local === 'drive') {
      store.setLocal({ drive: t.checked });
      if (t.checked && syncStatus().phase === 'ok' && !store.local.granted.drive) toast('Desconecta y vuelve a conectar Google para dar el permiso de Drive.', { ms: 7000 });
    } else if (t.matches('[data-checklist]')) {
      store.setSettings({
        checklist: t.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
      });
    } else if (t.matches('[data-import]')) {
      const file = t.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed || !Array.isArray(parsed.videos) || !Array.isArray(parsed.events)) throw new Error('formato');
        const clean = normalizeData(parsed);
        // Se mezcla con lo que hay: gana la versión más reciente de cada video o evento.
        const { mergeData } = await import('../google/sync.js');
        store.replaceData(mergeData(store.data, clean));
        toast(`Copia restaurada: ${clean.videos.filter((v) => !v.deleted).length} videos y ${clean.events.filter((x) => !x.deleted).length} eventos`);
      } catch {
        toast('Ese archivo no es una copia de Claqueta.', { tone: 'error' });
      }
      t.value = '';
    }
  });

  draw();
  refreshCalendars().then(() => draw('google'));
  const off = onSync(() => draw('google'));

  return {
    update: () => draw(),
    unmount: off,
  };
}
