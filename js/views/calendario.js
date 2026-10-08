// Vista "Calendario": mes con fichas arrastrables + panel del día, o agenda corrida.

import { store } from '../store.js';
import { dayItems, eventTimeLabel } from '../model.js';
import { $, esc, today, ymd, parseYmd, addDays, MESES, DIAS_CORTO, DIAS, fmtTime, fmtLong, cap, reducedMotion, EASE, diffDays } from '../util.js';
import { icon } from '../ui/icons.js';
import { chipDrag } from '../ui/drag.js';
import { eventIcon, chipClass, empty, statusChip } from '../ui/parts.js';
import { toast } from '../ui/toast.js';
import { openVideoSheet } from './video-sheet.js';
import { openEventSheet, newEvent } from './event-sheet.js';
import { remoteEvent } from '../google/remote.js';
import { adoptRemote, status as syncStatus } from '../google/sync.js';

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza en lunes
const MAX_CHIPS = 3;

function gridStart(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return ymd(new Date(year, month, 1 - offset));
}

export function openItem(item) {
  if (item.kind === 'video') openVideoSheet(item.id);
  else openEventSheet(item.id);
}

export function mount(el, params = {}) {
  const t0 = parseYmd(params.dia || today());
  let cursor = { y: t0.getFullYear(), m: t0.getMonth() };
  let selected = params.dia || today();
  let pending = false;
  const view = () => store.local.cal;

  el.innerHTML = `
    <header class="vh">
      <div>
        <h1 class="vh__title" data-title aria-live="polite"></h1>
        <p class="vh__sub" data-sub></p>
      </div>
      <div class="vh__actions">
        <div class="cal-nav">
          <button type="button" class="btn btn--icon" data-nav="-1" aria-label="Mes anterior">${icon('left')}</button>
          <button type="button" class="btn" data-nav="0">Hoy</button>
          <button type="button" class="btn btn--icon" data-nav="1" aria-label="Mes siguiente">${icon('right')}</button>
        </div>
        <div class="seg seg--tight" role="group" aria-label="Vista">
          <button type="button" class="seg__btn" data-mode="mes">Mes</button>
          <button type="button" class="seg__btn" data-mode="agenda">Agenda</button>
        </div>
        <button type="button" class="btn btn--primary" data-action="new-event">${icon('plus')}Nuevo evento<kbd>E</kbd></button>
      </div>
    </header>
    <div data-body></div>`;

  const body = $('[data-body]', el);

  function chip(item, date) {
    const movable = item.kind === 'video' || (item.kind === 'event' && !item.span) || (item.kind === 'remote' && !item.span && remoteEvent(item.id)?.canEdit);
    return `<button type="button" class="chip ${chipClass(item)}" data-chip data-kind="${item.kind}" data-id="${esc(item.id)}" ${movable ? 'data-movable' : ''} title="${esc(item.title)}">
      ${eventIcon(item, 13)}${item.time ? `<time>${fmtTime(item.time).replace(':00', '').replace(' ', '')}</time>` : ''}<span>${esc(item.title)}</span>
    </button>`;
  }

  function monthHtml() {
    const start = gridStart(cursor.y, cursor.m);
    // Solo las semanas que tocan el mes (4, 5 o 6 filas).
    const lastDay = ymd(new Date(cursor.y, cursor.m + 1, 0));
    const count = (Math.floor(diffDays(lastDay, start) / 7) + 1) * 7;
    const end = addDays(start, count - 1);
    const items = dayItems(start, end);
    const t = today();
    let cells = '';
    for (let i = 0; i < count; i++) {
      const date = addDays(start, i);
      const d = parseYmd(date);
      const list = items.get(date) || [];
      const out = d.getMonth() !== cursor.m;
      const extra = list.length - MAX_CHIPS;
      cells += `
        <div class="cell ${out ? 'cell--out' : ''} ${date === t ? 'cell--today' : ''} ${date === selected ? 'is-selected' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'cell--weekend' : ''}" data-day="${date}">
          <button type="button" class="cell__num" data-select="${date}" aria-label="${esc(fmtLong(date))}, ${list.length} ${list.length === 1 ? 'elemento' : 'elementos'}" ${date === selected ? 'aria-current="date"' : ''}>${d.getDate()}</button>
          <div class="cell__chips">
            ${list.slice(0, extra > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((it) => chip(it, date)).join('')}
            ${extra > 0 ? `<button type="button" class="cell__more" data-select="${date}">+${extra + 1} más</button>` : ''}
          </div>
          <div class="cell__dots" aria-hidden="true">${list.slice(0, 4).map((it) => `<i class="${chipClass(it)}"></i>`).join('')}</div>
        </div>`;
    }
    return `
      <div class="cal">
        <div class="cal__main">
          <div class="cal__weekdays" aria-hidden="true">${WEEK.map((w) => `<span>${DIAS_CORTO[w]}</span>`).join('')}</div>
          <div class="cal__grid" data-grid>${cells}</div>
        </div>
        <aside class="day" data-day-panel aria-live="polite">${dayPanelHtml(items)}</aside>
      </div>`;
  }

  function itemRow(item) {
    const time = item.kind === 'video' ? (item.time ? fmtTime(item.time) : 'Entrega') : item.allDay ? 'Todo el día' : fmtTime(item.time);
    const sub = item.kind === 'video' ? statusChip(item.status) + (item.sub ? `<span>${esc(item.sub)}</span>` : '') : [item.span ? `Día ${item.span}` : '', item.sub].filter(Boolean).map(esc).join(' · ');
    return `
      <li>
        <button type="button" class="arow ${chipClass(item)}" data-chip data-kind="${item.kind}" data-id="${esc(item.id)}">
          <span class="arow__time">${esc(time)}</span>
          <span class="arow__ic">${eventIcon(item, 16)}</span>
          <span class="arow__main"><b>${esc(item.title)}</b>${sub ? `<span class="arow__sub">${sub}</span>` : ''}</span>
          ${item.kind === 'remote' ? `<span class="arow__g" title="Google Calendar">G</span>` : ''}
        </button>
      </li>`;
  }

  function dayPanelHtml(items) {
    const list = (items || dayItems(selected, selected)).get(selected) || [];
    const d = parseYmd(selected);
    const rel = diffDays(selected, today());
    const relText = rel === 0 ? 'Hoy' : rel === 1 ? 'Mañana' : rel === -1 ? 'Ayer' : '';
    return `
      <header class="day__head">
        <div><p class="day__rel">${relText || cap(DIAS[d.getDay()])}</p>
        <h2 class="day__title">${d.getDate()} <span>${MESES[d.getMonth()]}</span></h2></div>
        <button type="button" class="btn btn--icon" data-action="new-event-day" aria-label="Añadir evento el ${esc(fmtLong(selected))}" title="Añadir evento este día">${icon('plus')}</button>
      </header>
      ${
        list.length
          ? `<ul class="agenda">${list.map(itemRow).join('')}</ul>`
          : `<p class="day__empty">Día libre. Pulsa ${icon('plus', 14)} para apartar una grabación.</p>`
      }`;
  }

  function agendaHtml() {
    const from = ymd(new Date(cursor.y, cursor.m, 1)) < today() && cursor.y === new Date().getFullYear() && cursor.m === new Date().getMonth() ? today() : ymd(new Date(cursor.y, cursor.m, 1));
    const to = addDays(from, 75);
    const items = dayItems(from, to);
    const days = [...items.keys()].sort();
    if (!days.length) {
      return empty({ title: 'Agenda despejada', text: 'No hay grabaciones, eventos ni entregas en los próximos dos meses.', action: `<button type="button" class="btn" data-action="new-event">${icon('plus')}Nuevo evento</button>` });
    }
    const t = today();
    return `<div class="agenda-list">${days
      .map((date) => {
        const d = parseYmd(date);
        return `
        <section class="aday ${date === t ? 'aday--today' : ''}" data-day="${date}">
          <header class="aday__head"><span class="aday__num">${d.getDate()}</span><span class="aday__meta">${cap(DIAS[d.getDay()])}<br>${MESES[d.getMonth()]}</span></header>
          <ul class="agenda">${items.get(date).map(itemRow).join('')}</ul>
        </section>`;
      })
      .join('')}</div>`;
  }

  function header() {
    $('[data-title]', el).innerHTML = `${cap(MESES[cursor.m])} <span>${cursor.y}</span>`;
    const s = syncStatus();
    const sub = $('[data-sub]', el);
    if (s.phase === 'ok' || s.phase === 'syncing') sub.innerHTML = `${icon('check', 14)} Conectado con Google Calendar`;
    else if (s.phase === 'expired') sub.innerHTML = `La sesión de Google caducó. <a href="#/ajustes">Reconectar</a>`;
    else sub.innerHTML = `Grabaciones, eventos y entregas. <a href="#/ajustes">Conecta Google Calendar</a> para verlos en tu celular.`;
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === view().mode)));
  }

  function draw(dir = 0) {
    if (document.body.classList.contains('is-dragging')) {
      pending = true;
      return;
    }
    header();
    const focusSel = document.activeElement?.dataset?.select;
    body.innerHTML = view().mode === 'agenda' ? agendaHtml() : monthHtml();
    if (focusSel) body.querySelector(`.cell__num[data-select="${focusSel}"]`)?.focus({ preventScroll: true });
    if (dir && !reducedMotion()) {
      const target = $('[data-grid]', body) || $('.agenda-list', body);
      target?.animate(
        [
          { opacity: 0, transform: `translateX(${dir * 28}px)` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 360, easing: EASE },
      );
    }
  }

  function select(date, { focus = false } = {}) {
    const d = parseYmd(date);
    const changedMonth = d.getMonth() !== cursor.m || d.getFullYear() !== cursor.y;
    selected = date;
    if (changedMonth && view().mode === 'mes') {
      const dir = date > ymd(new Date(cursor.y, cursor.m, 15)) ? 1 : -1;
      cursor = { y: d.getFullYear(), m: d.getMonth() };
      draw(dir);
    } else {
      body.querySelectorAll('.cell.is-selected').forEach((c) => {
        c.classList.remove('is-selected');
        c.querySelector('.cell__num')?.removeAttribute('aria-current');
      });
      const cell = body.querySelector(`.cell[data-day="${date}"]`);
      cell?.classList.add('is-selected');
      cell?.querySelector('.cell__num')?.setAttribute('aria-current', 'date');
      const panel = $('[data-day-panel]', body);
      if (panel) {
        panel.innerHTML = dayPanelHtml();
        if (!reducedMotion()) panel.animate([{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
      }
    }
    if (focus) body.querySelector(`.cell__num[data-select="${date}"]`)?.focus();
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nav], [data-mode], [data-action], [data-chip], [data-select]');
    if (!t) {
      const cell = e.target.closest('.cell');
      if (cell) select(cell.dataset.day);
      return;
    }
    if (t.dataset.nav != null) {
      const n = Number(t.dataset.nav);
      if (n === 0) {
        const now = new Date();
        const dir = Math.sign(now.getFullYear() * 12 + now.getMonth() - (cursor.y * 12 + cursor.m));
        cursor = { y: now.getFullYear(), m: now.getMonth() };
        selected = today();
        draw(dir);
      } else {
        const d = new Date(cursor.y, cursor.m + n, 1);
        cursor = { y: d.getFullYear(), m: d.getMonth() };
        draw(n);
      }
    } else if (t.dataset.mode) {
      store.setLocal({ cal: { ...view(), mode: t.dataset.mode } }, { silent: true });
      draw();
    } else if (t.dataset.action === 'new-event') {
      newEvent({ date: selected });
    } else if (t.dataset.action === 'new-event-day') {
      newEvent({ date: selected });
    } else if (t.dataset.chip != null) {
      openItem({ kind: t.dataset.kind, id: t.dataset.id });
    } else if (t.dataset.select) {
      select(t.dataset.select);
    }
  });

  el.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.cell');
    if (cell && !e.target.closest('[data-chip]')) newEvent({ date: cell.dataset.day });
  });

  // Flechas para moverse por los días, como en cualquier calendario.
  el.addEventListener('keydown', (e) => {
    if (!e.target.matches?.('.cell__num')) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    select(addDays(e.target.dataset.select, step), { focus: true });
  });

  chipDrag(body, {
    onDrop: ({ kind, id, date, from }) => {
      const delta = diffDays(date, from);
      selected = date;
      if (kind === 'video') {
        const v = store.video(id);
        if (!v) return;
        const prev = v.due;
        store.updateVideo(id, { due: date });
        toast(`Entrega movida al ${fmtLong(date)}`, { action: 'Deshacer', onAction: () => store.updateVideo(id, { due: prev }) });
      } else {
        let ev = kind === 'remote' ? null : store.event(id);
        if (kind === 'remote') {
          const r = remoteEvent(id);
          if (!r || !r.canEdit) return;
          ev = adoptRemote(r);
        }
        if (!ev) return;
        const prev = { date: ev.date, endDate: ev.endDate };
        store.updateEvent(ev.id, { date: addDays(ev.date, delta), endDate: ev.endDate ? addDays(ev.endDate, delta) : '' });
        toast(`Evento movido al ${fmtLong(date)}`, { action: 'Deshacer', onAction: () => store.updateEvent(ev.id, prev) });
      }
    },
    onSettle: () => {
      if (!pending) return;
      pending = false;
      draw();
    },
  });

  draw();

  return {
    update: () => draw(),
    newEvent: () => newEvent({ date: selected }),
  };
}
