// Piezas de interfaz que se repiten en varias vistas.

import { esc } from '../util.js';
import { icon } from './icons.js';
import { STATUS, EVENT_TYPE, dueInfo, progress } from '../model.js';

export function statusChip(status) {
  return `<span class="st st--${status}"><i></i>${esc(STATUS[status]?.label || status)}</span>`;
}

export function dueBadge(v) {
  const info = dueInfo(v);
  if (info.tone === 'none') return `<span class="due due--none">Sin fecha</span>`;
  const ic = info.tone === 'done' ? 'check' : 'flag';
  return `<span class="due due--${info.tone}">${icon(ic, 14)}${esc(info.label)}</span>`;
}

/** Avance de la lista de pasos como perforaciones de película. */
export function perf(v) {
  const p = progress(v);
  if (!p.total) return '';
  const cells = v.checklist
    .slice(0, 12)
    .map((c) => `<i class="${c.done ? 'on' : ''}"></i>`)
    .join('');
  return `<span class="perf" role="img" aria-label="${p.done} de ${p.total} pasos hechos">${cells}<b>${p.done}/${p.total}</b></span>`;
}

export function eventIcon(item, size = 14) {
  if (item.kind === 'video') return icon(item.status === 'entregado' ? 'check' : 'flag', size);
  return icon(EVENT_TYPE[item.type]?.icon || 'dot', size);
}

export function chipClass(item) {
  if (item.kind === 'video') return `chip--video chip--${item.late ? 'late' : item.status}`;
  return `chip--${item.kind} chip--t-${item.type}`;
}

export function segmented(name, options, value, { label = '' } = {}) {
  return `<div class="seg" role="radiogroup" ${label ? `aria-label="${esc(label)}"` : ''}>
    ${options
      .map(
        (o) => `<label class="seg__opt"><input type="radio" name="${esc(name)}" value="${esc(o.id)}" ${o.id === value ? 'checked' : ''}><span>${o.icon ? icon(o.icon, 15) : ''}${esc(o.label)}</span></label>`,
      )
      .join('')}
  </div>`;
}

export function empty({ title, text, action = '' }) {
  return `<div class="empty"><p class="empty__title">${esc(title)}</p><p class="empty__text">${text}</p>${action}</div>`;
}
