// Vista "Videos": tablero por estados (con arrastre) y lista.

import { store } from '../store.js';
import { STATUSES, ADVANCE, nextStatus, sortVideos, clients, dueInfo, progress } from '../model.js';
import { $, esc, debounce, money, fmtShort, ymd, plural } from '../util.js';
import { icon } from '../ui/icons.js';
import { flip, keepFocus, clap } from '../ui/motion.js';
import { boardDrag } from '../ui/drag.js';
import { dueBadge, perf, statusChip, empty } from '../ui/parts.js';
import { toast } from '../ui/toast.js';
import { openVideoSheet, newVideo } from './video-sheet.js';

const DONE_VISIBLE = 6;

export function setStatus(id, status, extra = {}) {
  const v = store.video(id);
  if (!v || v.status === status) return;
  const prev = v.status;
  store.updateVideo(id, { status, ...extra });
  if (status === 'entregado') {
    clap();
    toast(`«${v.title || 'Video'}» entregado`, { action: 'Deshacer', onAction: () => store.updateVideo(id, { status: prev }) });
  }
}

export function mount(el, params = {}) {
  const prefs = { q: '', client: '', showAllDone: false };
  const view = () => store.local.videos;
  const setView = (patch) => store.setLocal({ videos: { ...view(), ...patch } }, { silent: true });

  el.innerHTML = `
    <header class="vh">
      <div>
        <h1 class="vh__title">Videos</h1>
        <p class="vh__sub" data-sub></p>
      </div>
      <div class="vh__actions">
        <button type="button" class="btn btn--primary" data-action="new-video">${icon('plus')}Nuevo video<kbd>N</kbd></button>
      </div>
    </header>
    <div class="toolbar">
      <label class="search">${icon('search')}<span class="sr">Buscar videos</span>
        <input type="search" placeholder="Buscar por título o cliente" data-q autocomplete="off">
      </label>
      <label class="field-inline"><span class="sr">Cliente</span><select data-client></select></label>
      <label class="field-inline"><span class="sr">Orden</span>
        <select data-sort>
          <option value="manual">Orden manual</option>
          <option value="due">Por fecha de entrega</option>
          <option value="priority">Por prioridad</option>
        </select>
      </label>
      <div class="seg seg--tight toolbar__mode" role="group" aria-label="Vista">
        <button type="button" class="seg__btn" data-mode="board">${icon('board', 16)}Tablero</button>
        <button type="button" class="seg__btn" data-mode="list">${icon('list', 16)}Lista</button>
      </div>
    </div>
    <div data-body></div>`;

  const body = $('[data-body]', el);
  const qInput = $('[data-q]', el);
  const clientSel = $('[data-client]', el);
  const sortSel = $('[data-sort]', el);
  let pending = false;

  function filtered() {
    const q = prefs.q.trim().toLowerCase();
    return store.videos().filter((v) => {
      if (prefs.client && v.client !== prefs.client) return false;
      if (!q) return true;
      return `${v.title} ${v.client} ${v.type}`.toLowerCase().includes(q);
    });
  }

  function card(v) {
    const next = nextStatus(v.status);
    const meta = [v.client, v.type].filter(Boolean).map(esc).join(' · ');
    const done = v.status === 'entregado';
    return `
      <article class="card ${done ? 'card--done' : ''} ${dueInfo(v).tone === 'late' ? 'card--late' : ''}" data-card data-flip="v-${v.id}" data-id="${v.id}">
        <div class="card__top">
          <h3 class="card__title"><button type="button" class="card__open" data-action="open" data-id="${v.id}">${esc(v.title) || '<em>Sin título</em>'}</button></h3>
          ${v.priority === 'alta' && !done ? `<span class="tag tag--alta">${icon('up', 12)}Alta</span>` : ''}
        </div>
        ${meta ? `<p class="card__meta">${meta}</p>` : ''}
        <div class="card__foot">
          ${done ? `<span class="due due--done">${icon('check', 14)}${v.deliveredAt ? fmtShort(ymd(new Date(v.deliveredAt))) : 'Entregado'}</span>` : dueBadge(v)}
          ${done ? '' : perf(v)}
          ${v.price && !v.paid && done ? `<span class="tag tag--owed">Por cobrar</span>` : ''}
          ${next ? `<button type="button" class="card__adv" data-nodrag data-action="advance" data-id="${v.id}" aria-label="${esc(ADVANCE[next.id])}: pasar a ${esc(next.label)}" title="${esc(ADVANCE[next.id])} (pasar a ${esc(next.label)})">${icon('arrow', 16)}</button>` : ''}
        </div>
      </article>`;
  }

  function boardHtml(list) {
    const tab = view().tab;
    const tabs = `<div class="board-tabs" role="tablist" aria-label="Estado">
      ${STATUSES.map((s) => {
        const n = list.filter((v) => v.status === s.id).length;
        return `<button type="button" role="tab" aria-selected="${s.id === tab}" class="board-tab st--${s.id}" data-tab="${s.id}"><i></i>${esc(s.label)}<b>${n}</b></button>`;
      }).join('')}
    </div>`;

    const cols = STATUSES.map((s) => {
      let items = sortVideos(
        list.filter((v) => v.status === s.id),
        s.id === 'entregado' ? 'manual' : view().sort,
      );
      if (s.id === 'entregado') items = [...items].sort((a, b) => (b.deliveredAt || 0) - (a.deliveredAt || 0));
      const hidden = s.id === 'entregado' && !prefs.showAllDone ? Math.max(0, items.length - DONE_VISIBLE) : 0;
      const shown = hidden ? items.slice(0, DONE_VISIBLE) : items;
      const hint =
        s.id === 'pendiente'
          ? 'Escribe arriba el título y pulsa Enter.'
          : s.id === 'entregado'
            ? 'Aquí caen los videos terminados.'
            : 'Arrastra una tarjeta hasta aquí.';
      return `
        <section class="col st--${s.id}" data-col="${s.id}" ${s.id === tab ? 'data-current' : ''} aria-label="${esc(s.label)}">
          <header class="col__head">
            <i class="col__dot"></i><h2>${esc(s.label)}</h2><span class="col__count">${items.length}</span>
          </header>
          ${
            s.id === 'pendiente'
              ? `<form class="quick" data-quick><label class="sr" for="quick-add">Añadir video pendiente</label>
                  <input id="quick-add" type="text" placeholder="Añadir video…" data-keep="quick" autocomplete="off" enterkeyhint="done" maxlength="140">
                  <button type="submit" class="btn btn--icon btn--quiet" aria-label="Añadir">${icon('plus')}</button></form>`
              : ''
          }
          <div class="col__list" data-list>
            ${shown.map(card).join('')}
            <p class="col__hint">${hint}</p>
          </div>
          ${hidden ? `<button type="button" class="btn btn--quiet col__more" data-action="more-done">Ver ${hidden} más</button>` : ''}
          ${s.id === 'entregado' && prefs.showAllDone && items.length > DONE_VISIBLE ? `<button type="button" class="btn btn--quiet col__more" data-action="less-done">Ver menos</button>` : ''}
        </section>`;
    }).join('');

    return `${tabs}<div class="board" data-board>${cols}</div>`;
  }

  function listHtml(list) {
    const rank = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]));
    let items = sortVideos(list, view().sort);
    if (view().sort === 'manual') items = [...items].sort((a, b) => rank[a.status] - rank[b.status] || a.order - b.order);
    if (!items.length) return '';
    const cur = store.settings.currency;
    return `
      <div class="vlist" role="table" aria-label="Videos">
        <div class="vlist__head" role="row">
          <span role="columnheader">Video</span><span role="columnheader">Entrega</span><span role="columnheader">Avance</span><span role="columnheader">Pago</span><span role="columnheader">Estado</span>
        </div>
        ${items
          .map((v) => {
            const meta = [v.client, v.type].filter(Boolean).map(esc).join(' · ');
            const p = progress(v);
            return `
          <div class="vrow ${v.status === 'entregado' ? 'vrow--done' : ''}" role="row" data-flip="v-${v.id}">
            <div class="vrow__main" role="cell">
              <button type="button" class="vrow__open" data-action="open" data-id="${v.id}">${esc(v.title) || '<em>Sin título</em>'}</button>
              ${meta ? `<span class="vrow__meta">${meta}</span>` : ''}
            </div>
            <div role="cell">${dueBadge(v)}</div>
            <div role="cell" class="vrow__perf">${p.total ? perf(v) : '<span class="muted">—</span>'}</div>
            <div role="cell" class="vrow__pay">${v.price ? `${esc(money(v.price, cur))}${v.paid ? `<span class="paid">${icon('check', 13)}Pagado</span>` : ''}` : '<span class="muted">—</span>'}</div>
            <div role="cell">
              <label class="st-select st--${v.status}"><span class="sr">Estado de ${esc(v.title)}</span><i></i>
                <select data-status="${v.id}">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
              </label>
            </div>
          </div>`;
          })
          .join('')}
      </div>`;
  }

  function draw() {
    if (document.body.classList.contains('is-dragging')) {
      pending = true;
      return;
    }
    const all = store.videos();
    const list = filtered();
    const active = all.filter((v) => v.status !== 'entregado').length;
    const late = all.filter((v) => dueInfo(v).tone === 'late').length;
    $('[data-sub]', el).innerHTML = all.length
      ? `${plural(active, 'video activo', 'videos activos')}${late ? ` · <span class="late">${plural(late, 'atrasado', 'atrasados')}</span>` : ''}`
      : 'Tu cola de edición, de pendiente a entregado.';

    const cl = clients();
    clientSel.innerHTML = `<option value="">Todos los clientes</option>${cl.map((c) => `<option ${c === prefs.client ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
    clientSel.closest('label').hidden = cl.length < 2;
    sortSel.value = view().sort;
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === view().mode)));

    const filtering = prefs.q.trim() || prefs.client;
    let html;
    if (!all.length) {
      html =
        boardHtml([]) +
        empty({
          title: 'Aún no hay videos en la cola',
          text: 'Añade el primero en <b>Pendiente</b> y arrástralo de columna en columna según avances. Cada video guarda su fecha de entrega, sus pasos y el pago.',
          action: `<button type="button" class="btn" data-action="samples">Ver con datos de ejemplo</button>`,
        });
    } else if (view().mode === 'list') {
      html = listHtml(list) || empty({ title: 'Nada coincide', text: 'Prueba con otro texto o quita el filtro de cliente.' });
    } else {
      html = boardHtml(list) + (filtering && !list.length ? empty({ title: 'Nada coincide', text: 'Prueba con otro texto o quita el filtro de cliente.' }) : '');
    }
    flip(body, () => keepFocus(body, () => (body.innerHTML = html)));
  }

  /* ----- eventos ----- */

  qInput.addEventListener(
    'input',
    debounce(() => {
      prefs.q = qInput.value;
      draw();
    }, 120),
  );
  clientSel.addEventListener('change', () => {
    prefs.client = clientSel.value;
    draw();
  });
  sortSel.addEventListener('change', () => {
    setView({ sort: sortSel.value });
    draw();
  });

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action], [data-mode], [data-tab]');
    if (!t) return;
    if (t.dataset.mode) {
      setView({ mode: t.dataset.mode });
      draw();
    } else if (t.dataset.tab) {
      setView({ tab: t.dataset.tab });
      draw();
    } else if (t.dataset.action === 'open') {
      openVideoSheet(t.dataset.id);
    } else if (t.dataset.action === 'advance') {
      const v = store.video(t.dataset.id);
      const next = v && nextStatus(v.status);
      if (next) setStatus(v.id, next.id);
    } else if (t.dataset.action === 'new-video') {
      newVideo();
    } else if (t.dataset.action === 'more-done' || t.dataset.action === 'less-done') {
      prefs.showAllDone = t.dataset.action === 'more-done';
      draw();
    } else if (t.dataset.action === 'samples') {
      import('../samples.js').then((m) => m.loadSamples());
    }
  });

  el.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-quick]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    store.addVideo({ title, client: prefs.client || '' });
  });

  el.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status]');
    if (sel) setStatus(sel.dataset.status, sel.value);
  });

  boardDrag(body, {
    reorder: () => view().sort === 'manual',
    onDrop: ({ id, status, beforeId, afterId }) => {
      const v = store.video(id);
      if (!v) return;
      const patch = {};
      if (view().sort === 'manual' && status !== 'entregado') {
        const b = beforeId && store.video(beforeId);
        const a = afterId && store.video(afterId);
        patch.order = a && b ? (a.order + b.order) / 2 : b ? b.order - 1 : a ? a.order + 1 : 0;
      }
      if (v.status !== status) setStatus(id, status, patch);
      else if (patch.order != null) store.updateVideo(id, patch);
    },
    onSettle: () => {
      if (!pending) return;
      pending = false;
      draw();
    },
  });

  draw();
  if (params.v && store.video(params.v)) openVideoSheet(params.v);
  if (params.nuevo) newVideo();

  return {
    update: draw,
    focusSearch: () => qInput.focus(),
  };
}
