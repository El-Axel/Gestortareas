// Panel de un evento del calendario (grabación, evento, reunión…).
// Sirve igual para los eventos creados aquí y para los que vienen de Google Calendar.

import { store } from '../store.js';
import { EVENT_TYPES, clients, activeVideos } from '../model.js';
import { $, esc, debounce, today, hmToMin, minToHm, canonical, fmtLong, cap } from '../util.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { segmented } from '../ui/parts.js';
import { toast } from '../ui/toast.js';
import { remoteEvent } from '../google/remote.js';
import { adoptRemote, isConnected } from '../google/sync.js';

export function newEvent(partial = {}) {
  const e = store.addEvent({ date: today(), ...partial }, { quiet: true });
  openEventSheet(e.id, { isNew: true });
}

export function openEventSheet(id, { isNew = false } = {}) {
  let remote = String(id).startsWith('g:') ? remoteEvent(id) : null;
  let localId = remote ? null : id;
  const get = () => (localId ? store.event(localId) : remote);
  const e0 = get();
  if (!e0) return;
  const readOnly = !!remote && !remote.canEdit;

  const save = (patch) => {
    if (readOnly) return;
    const cur = get();
    if (!cur) return;
    if (!Object.keys(patch).some((k) => canonical(cur[k]) !== canonical(patch[k]))) return;
    if (!localId) {
      // Primer cambio sobre un evento de Google: pasa a ser editable desde aquí.
      localId = adoptRemote(remote).id;
      remote = null;
    }
    store.updateEvent(localId, patch);
  };

  const dis = readOnly ? 'disabled' : '';
  const vids = activeVideos();

  const googleLine = () => {
    const e = get();
    const link = e?.htmlLink ? ` <a href="${esc(e.htmlLink)}" target="_blank" rel="noopener noreferrer">Abrir en Google Calendar</a>` : '';
    if (readOnly) return `${icon('calendar', 16)}<span>Evento de un calendario de solo lectura${e.calName ? ` (${esc(e.calName)})` : ''}.${link}</span>`;
    if (remote) return `${icon('calendar', 16)}<span>Viene de tu Google Calendar. Lo que cambies aquí también cambia allá.${link}</span>`;
    if (e?.sample) return `${icon('note', 16)}<span>Evento de ejemplo: no se envía a Google.</span>`;
    if (e?.gcal?.id) return `${icon('check', 16)}<span>Está en tu Google Calendar.${link}</span>`;
    if (isConnected()) return `${icon('sync', 16)}<span>Se enviará a tu Google Calendar en unos segundos.</span>`;
    return `${icon('cloud', 16)}<span>Guardado solo en Claqueta. <a href="#/ajustes" data-close>Conecta Google Calendar</a> para verlo en tu celular.</span>`;
  };

  const head = segmented('type', EVENT_TYPES, e0.type, { label: 'Tipo de evento' });
  const body = `
    <label class="sr" for="e-title">Título del evento</label>
    <textarea id="e-title" class="title-input" rows="1" placeholder="¿Qué vas a grabar?" data-f="title" maxlength="140" ${dis}>${esc(e0.title)}</textarea>

    <fieldset class="field" ${dis}>
      <legend class="label">Cuándo</legend>
      <div class="grid2">
        <label><span class="sublabel">Fecha</span><input type="date" data-f="date" value="${esc(e0.date)}" required></label>
        <label><span class="sublabel">Hasta (opcional)</span><input type="date" data-f="endDate" value="${esc(e0.endDate || '')}" min="${esc(e0.date)}"></label>
      </div>
      <div class="grid2" data-times ${e0.allDay ? 'hidden' : ''}>
        <label><span class="sublabel">Empieza</span><input type="time" data-f="start" value="${esc(e0.start || '09:00')}"></label>
        <label><span class="sublabel">Termina</span><input type="time" data-f="end" value="${esc(e0.end || '')}"></label>
      </div>
      <label class="switch"><input type="checkbox" data-f="allDay" ${e0.allDay ? 'checked' : ''}><i></i><span>Todo el día</span></label>
      <p class="muted" data-when></p>
    </fieldset>

    <label class="field"><span class="label">Lugar</span>
      <input type="text" data-f="location" value="${esc(e0.location)}" placeholder="Dirección o enlace de la llamada" ${dis}>
    </label>

    <div class="grid2">
      <label class="field"><span class="label">Cliente</span>
        <input type="text" list="dl-eclients" data-f="client" value="${esc(e0.client)}" autocomplete="off" ${dis}>
      </label>
      <label class="field"><span class="label">Video relacionado</span>
        <select data-f="videoId" ${dis}>
          <option value="">Ninguno</option>
          ${vids.map((v) => `<option value="${v.id}" ${v.id === e0.videoId ? 'selected' : ''}>${esc(v.title || 'Sin título')}</option>`).join('')}
        </select>
      </label>
    </div>
    <datalist id="dl-eclients">${clients().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>

    <label class="field"><span class="label">Notas</span>
      <textarea data-f="notes" rows="4" placeholder="Equipo que llevar, contacto en el lugar, plan de tomas…" ${dis}>${esc(e0.notes)}</textarea>
    </label>

    <p class="gline" data-gline>${googleLine()}</p>

    ${
      readOnly
        ? ''
        : `<footer class="sheet__foot">
      <span></span>
      <span class="sheet__foot-actions">
        ${e0.videoId && store.video(e0.videoId) ? `<a class="btn btn--quiet btn--sm" href="#/videos?v=${e0.videoId}" data-close>${icon('board', 16)}Ver el video</a>` : ''}
        <button type="button" class="btn btn--quiet btn--sm btn--danger" data-delete>${icon('trash', 16)}Eliminar</button>
      </span>
    </footer>`
    }`;

  let removed = false;

  openSheet({
    label: 'Editar evento',
    head,
    body,
    onClose: () => {
      const e = get();
      if (removed || !e || !localId) return;
      if (isNew && !e.title.trim() && !e.notes && !e.location) store.purgeEvent(localId);
    },
    onMount: (el, api) => {
      if (readOnly) el.querySelectorAll('.sheet__head input').forEach((i) => (i.disabled = true));
      const title = $('#e-title', el);
      const grow = () => {
        title.style.height = 'auto';
        title.style.height = `${title.scrollHeight}px`;
      };
      grow();
      if (isNew) title.focus();

      const refresh = () => {
        const e = get();
        if (!e) return;
        $('[data-times]', el).hidden = !!e.allDay;
        $('[data-f="endDate"]', el).min = e.date;
        const multi = e.endDate && e.endDate > e.date;
        $('[data-when]', el).textContent = e.date ? `${cap(fmtLong(e.date))}${multi ? ` → ${fmtLong(e.endDate)}` : ''}` : '';
        $('[data-gline]', el).innerHTML = googleLine();
      };
      refresh();

      const saveText = debounce((f, value) => {
        save({ [f]: value });
        refresh();
      }, 250);
      const TEXT = ['title', 'location', 'client', 'notes'];

      el.addEventListener('input', (e) => {
        const f = e.target.dataset.f;
        if (!TEXT.includes(f)) return;
        if (f === 'title') grow();
        saveText(f, f === 'title' ? e.target.value.replace(/\n/g, ' ') : e.target.value);
      });
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          title.blur();
        }
      });
      el.addEventListener('focusout', (e) => {
        const f = e.target.dataset?.f;
        if (TEXT.includes(f)) saveText.flush(f, e.target.value.replace(/\n/g, f === 'title' ? ' ' : '\n').trim());
      });

      el.addEventListener('change', (e) => {
        const t = e.target;
        const f = t.dataset.f;
        const cur = get();
        if (t.name === 'type') {
          save({ type: t.value });
        } else if (f === 'allDay') {
          save({ allDay: t.checked });
        } else if (f === 'date') {
          if (!t.value) {
            t.value = cur.date;
            return;
          }
          const patch = { date: t.value };
          if (cur.endDate && cur.endDate <= t.value) {
            patch.endDate = '';
            $('[data-f="endDate"]', el).value = '';
          }
          save(patch);
        } else if (f === 'endDate') {
          save({ endDate: t.value && t.value > cur.date ? t.value : '' });
          if (t.value && t.value <= cur.date) t.value = '';
        } else if (f === 'start') {
          if (!t.value) {
            t.value = cur.start;
            return;
          }
          const patch = { start: t.value };
          // Mantiene la duración al mover la hora de inicio.
          if (cur.end && cur.start && !(cur.endDate > cur.date)) {
            const dur = Math.max(15, hmToMin(cur.end) - hmToMin(cur.start));
            patch.end = minToHm(hmToMin(t.value) + dur);
            $('[data-f="end"]', el).value = patch.end;
          }
          save(patch);
        } else if (f === 'end') {
          save({ end: t.value });
        } else if (f === 'videoId') {
          save({ videoId: t.value });
        }
        refresh();
      });

      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-delete]')) return;
        const name = get().title || 'Evento';
        if (!localId) {
          localId = adoptRemote(remote).id;
          remote = null;
        }
        const idToRemove = localId;
        removed = true;
        store.removeEvent(idToRemove);
        api.close();
        toast(`«${name}» eliminado`, { action: 'Deshacer', onAction: () => store.restoreEvent(idToRemove) });
      });
    },
  });
}
