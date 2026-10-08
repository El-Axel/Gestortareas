// Panel de un video: todo se guarda mientras escribes, no hay botón "Guardar".

import { store } from '../store.js';
import { STATUSES, PRIORITIES, clients, videoTypes, progress, dueInfo } from '../model.js';
import { $, esc, uid, debounce, fmtShort, ymd, normalizeUrl, today, addDays, canonical } from '../util.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { segmented } from '../ui/parts.js';
import { toast } from '../ui/toast.js';
import { clap } from '../ui/motion.js';

export function newVideo(partial = {}) {
  const v = store.addVideo(partial, { quiet: true });
  openVideoSheet(v.id, { isNew: true });
}

function checklistHtml(v) {
  const p = progress(v);
  const rows = v.checklist
    .map(
      (c) => `
      <li class="check ${c.done ? 'is-done' : ''}" data-step="${c.id}">
        <label class="check__box"><input type="checkbox" ${c.done ? 'checked' : ''} data-step-done aria-label="${esc(c.text) || 'Paso'}"><span>${icon('check', 14)}</span></label>
        <input type="text" class="check__text" value="${esc(c.text)}" data-step-text aria-label="Texto del paso" maxlength="120">
        <button type="button" class="btn btn--icon btn--quiet check__del" data-step-del aria-label="Quitar paso">${icon('x', 16)}</button>
      </li>`,
    )
    .join('');
  return `
    <div class="field__head">
      <span class="label">Pasos</span>
      ${p.total ? `<span class="muted">${p.done} de ${p.total}</span>` : ''}
    </div>
    ${p.total ? `<div class="bar" aria-hidden="true"><i style="transform:scaleX(${p.ratio})"></i></div>` : ''}
    <ul class="checks">${rows}</ul>
    <form class="check-add" data-step-add>
      <input type="text" placeholder="${p.total ? 'Añadir paso…' : 'Añadir un paso: corte, color, audio…'}" aria-label="Nuevo paso" maxlength="120" enterkeyhint="done">
      <button type="submit" class="btn btn--icon btn--quiet" aria-label="Añadir paso">${icon('plus')}</button>
    </form>
    ${!p.total && store.settings.checklist.length ? `<button type="button" class="btn btn--quiet btn--sm" data-template>${icon('list', 16)}Usar mi plantilla de ${store.settings.checklist.length} pasos</button>` : ''}`;
}

export function openVideoSheet(id, { isNew = false } = {}) {
  const v0 = store.video(id);
  if (!v0) return;
  const get = () => store.video(id);
  const save = (patch) => {
    const v = get();
    if (!v) return;
    // Solo se guarda si de verdad cambió algo (así no se dispara una sincronización en vano).
    if (Object.keys(patch).some((k) => canonical(v[k]) !== canonical(patch[k]))) store.updateVideo(id, patch);
  };

  const head = segmented(
    'status',
    STATUSES.map((s) => ({ id: s.id, label: s.label })),
    v0.status,
    { label: 'Estado' },
  );

  const body = `
    <label class="sr" for="v-title">Título del video</label>
    <textarea id="v-title" class="title-input" rows="1" placeholder="Título del video" data-f="title" maxlength="140">${esc(v0.title)}</textarea>

    <div class="grid2">
      <label class="field"><span class="label">Cliente</span>
        <input type="text" list="dl-clients" data-f="client" value="${esc(v0.client)}" placeholder="¿Para quién es?" autocomplete="off">
      </label>
      <label class="field"><span class="label">Tipo</span>
        <input type="text" list="dl-types" data-f="type" value="${esc(v0.type)}" placeholder="Reel, boda, YouTube…" autocomplete="off">
      </label>
    </div>
    <datalist id="dl-clients">${clients().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="dl-types">${videoTypes().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>

    <fieldset class="field">
      <legend class="label">Entrega</legend>
      <div class="grid2">
        <label><span class="sr">Fecha de entrega</span><input type="date" data-f="due" value="${esc(v0.due)}"></label>
        <label><span class="sr">Hora de entrega (opcional)</span><input type="time" data-f="dueTime" value="${esc(v0.dueTime)}"></label>
      </div>
      <div class="quick-dates">
        <button type="button" class="btn btn--sm" data-due="0">Hoy</button>
        <button type="button" class="btn btn--sm" data-due="1">Mañana</button>
        <button type="button" class="btn btn--sm" data-due="7">En una semana</button>
        <button type="button" class="btn btn--sm btn--quiet" data-due="">Sin fecha</button>
        <span class="muted" data-due-hint></span>
      </div>
    </fieldset>

    <div class="field">
      <span class="label" id="lbl-prio">Prioridad</span>
      ${segmented('priority', PRIORITIES, v0.priority, { label: 'Prioridad' })}
    </div>

    <section class="field" data-checklist>${checklistHtml(v0)}</section>

    <fieldset class="field">
      <legend class="label">Pago</legend>
      <div class="pay">
        <label class="pay__amount"><span class="sr">Valor acordado</span><span class="pay__cur">${esc(store.settings.currency)}</span>
          <input type="text" inputmode="numeric" data-f="price" value="${v0.price ? Number(v0.price).toLocaleString('es-CO') : ''}" placeholder="Valor acordado">
        </label>
        <label class="switch"><input type="checkbox" data-f="paid" ${v0.paid ? 'checked' : ''}><i></i><span>Pagado</span></label>
      </div>
    </fieldset>

    <fieldset class="field">
      <legend class="label">Enlaces</legend>
      <div class="link-field">
        <input type="url" inputmode="url" data-f="linkMaterial" value="${esc(v0.linkMaterial)}" placeholder="Material en bruto (Drive, WeTransfer…)" aria-label="Enlace al material">
        <a class="btn btn--icon btn--quiet" data-open="linkMaterial" target="_blank" rel="noopener noreferrer" aria-label="Abrir material">${icon('external')}</a>
      </div>
      <div class="link-field">
        <input type="url" inputmode="url" data-f="linkEntrega" value="${esc(v0.linkEntrega)}" placeholder="Video final para el cliente" aria-label="Enlace de entrega">
        <a class="btn btn--icon btn--quiet" data-open="linkEntrega" target="_blank" rel="noopener noreferrer" aria-label="Abrir entrega">${icon('external')}</a>
      </div>
    </fieldset>

    <label class="field"><span class="label">Notas</span>
      <textarea data-f="notes" rows="4" placeholder="Referencias, cambios que pidió el cliente, música…">${esc(v0.notes)}</textarea>
    </label>

    <footer class="sheet__foot">
      <span class="muted">Creado el ${fmtShort(ymd(new Date(v0.createdAt)))}</span>
      <span class="sheet__foot-actions">
        <button type="button" class="btn btn--quiet btn--sm" data-duplicate>${icon('copy', 16)}Duplicar</button>
        <button type="button" class="btn btn--quiet btn--sm btn--danger" data-delete>${icon('trash', 16)}Eliminar</button>
      </span>
    </footer>`;

  let removed = false;

  openSheet({
    label: 'Editar video',
    head,
    body,
    onClose: () => {
      const v = get();
      if (removed || !v) return;
      // Un video nuevo que se cerró vacío no se guarda.
      const blank = !v.title.trim() && !v.client && !v.due && !v.notes && !v.checklist.length && !v.price;
      if (isNew && blank) store.purgeVideo(id);
    },
    onMount: (el, api) => {
      const title = $('#v-title', el);
      const grow = () => {
        title.style.height = 'auto';
        title.style.height = `${title.scrollHeight}px`;
      };
      grow();
      if (isNew) title.focus();

      const refreshLinks = () => {
        el.querySelectorAll('[data-open]').forEach((a) => {
          const url = normalizeUrl(get()?.[a.dataset.open]);
          a.hidden = !url;
          if (url) a.href = url;
        });
      };
      const refreshDue = () => {
        const v = get();
        const info = v.due ? dueInfo(v) : null;
        $('[data-due-hint]', el).textContent = info && info.tone !== 'done' ? info.label : '';
        $('[data-due-hint]', el).className = `muted ${info?.tone === 'late' ? 'late' : ''}`;
      };
      refreshLinks();
      refreshDue();

      const saveText = debounce((field, value) => save({ [field]: value }), 250);

      el.addEventListener('input', (e) => {
        const f = e.target.dataset.f;
        if (!f) return;
        if (f === 'title') {
          grow();
          saveText('title', e.target.value.replace(/\n/g, ' '));
        } else if (f === 'price') {
          const digits = e.target.value.replace(/[^\d]/g, '');
          const n = digits ? Number(digits) : null;
          e.target.value = n ? n.toLocaleString('es-CO') : '';
          save({ price: n });
        } else if (f === 'notes' || f === 'client' || f === 'type' || f === 'linkMaterial' || f === 'linkEntrega') {
          saveText(f, e.target.value);
        }
      });
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          title.blur();
        }
      });
      // Al salir de un campo se guarda de inmediato lo que haya pendiente.
      el.addEventListener('focusout', (e) => {
        const f = e.target.dataset?.f;
        if (!f || e.target.type === 'checkbox') return;
        if (['title', 'notes', 'client', 'type', 'linkMaterial', 'linkEntrega'].includes(f)) {
          const value = f === 'title' ? e.target.value.replace(/\n/g, ' ').trim() : e.target.value.trim();
          saveText.flush(f, value);
          refreshLinks();
        }
      });

      el.addEventListener('change', (e) => {
        const t = e.target;
        if (t.name === 'status') {
          const prev = get().status;
          save({ status: t.value });
          if (t.value === 'entregado' && prev !== 'entregado') clap();
          refreshDue();
        } else if (t.name === 'priority') {
          save({ priority: t.value });
        } else if (t.dataset.f === 'due' || t.dataset.f === 'dueTime') {
          save({ [t.dataset.f]: t.value });
          refreshDue();
        } else if (t.dataset.f === 'paid') {
          save({ paid: t.checked });
        } else if (t.matches('[data-step-done]')) {
          const stepId = t.closest('[data-step]').dataset.step;
          save({ checklist: get().checklist.map((c) => (c.id === stepId ? { ...c, done: t.checked } : c)) });
          redrawChecklist();
        } else if (t.matches('[data-step-text]')) {
          const stepId = t.closest('[data-step]').dataset.step;
          const text = t.value.trim();
          save({ checklist: text ? get().checklist.map((c) => (c.id === stepId ? { ...c, text } : c)) : get().checklist.filter((c) => c.id !== stepId) });
          if (!text) redrawChecklist();
        }
      });

      const box = $('[data-checklist]', el);
      const redrawChecklist = (focusAdd = false) => {
        box.innerHTML = checklistHtml(get());
        if (focusAdd) $('[data-step-add] input', box).focus();
      };

      el.addEventListener('submit', (e) => {
        if (!e.target.matches('[data-step-add]')) return;
        e.preventDefault();
        const input = e.target.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        save({ checklist: [...get().checklist, { id: uid().slice(0, 8), text, done: false }] });
        redrawChecklist(true);
      });

      el.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.matches('[data-step-del]')) {
          const stepId = t.closest('[data-step]').dataset.step;
          save({ checklist: get().checklist.filter((c) => c.id !== stepId) });
          redrawChecklist();
        } else if (t.matches('[data-template]')) {
          save({ checklist: store.settings.checklist.map((text) => ({ id: uid().slice(0, 8), text, done: false })) });
          redrawChecklist();
        } else if ('due' in t.dataset) {
          const due = t.dataset.due === '' ? '' : addDays(today(), Number(t.dataset.due));
          $('[data-f="due"]', el).value = due;
          const patch = { due };
          if (!due) {
            patch.dueTime = '';
            $('[data-f="dueTime"]', el).value = '';
          }
          save(patch);
          refreshDue();
        } else if (t.matches('[data-delete]')) {
          const name = get().title || 'Video';
          removed = true;
          store.removeVideo(id);
          api.close();
          toast(`«${name}» eliminado`, { action: 'Deshacer', onAction: () => store.restoreVideo(id) });
        } else if (t.matches('[data-duplicate]')) {
          const { id: _id, gcal, gcalRev, createdAt, updatedAt, deliveredAt, startedAt, sample, ...rest } = get();
          const copy = store.addVideo({
            ...rest,
            title: `${rest.title} (copia)`,
            status: 'pendiente',
            paid: false,
            checklist: rest.checklist.map((c) => ({ ...c, id: uid().slice(0, 8), done: false })),
            order: undefined,
          });
          toast('Video duplicado en Pendiente');
          openVideoSheet(copy.id);
        }
      });
    },
  });
}
