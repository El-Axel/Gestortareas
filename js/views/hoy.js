// Vista "Hoy": la línea de tiempo de las próximas semanas (como la de tu editor),
// lo que toca entregar y la agenda cercana.

import { store } from '../store.js';
import { STATUSES, ADVANCE, activeVideos, dueInfo, countdown, dayItems, summary, unpaid, deliveredThisMonth, nextStatus, progress } from '../model.js';
import { $, esc, today, addDays, parseYmd, diffDays, ymd, DIAS, DIAS_CORTO, MESES, MESES_CORTO, cap, fmtTime, money, plural, reducedMotion, EASE } from '../util.js';
import { icon } from '../ui/icons.js';
import { flip } from '../ui/motion.js';
import { statusChip, perf, eventIcon, chipClass, empty } from '../ui/parts.js';
import { openVideoSheet, newVideo } from './video-sheet.js';
import { newEvent } from './event-sheet.js';
import { openItem } from './calendario.js';
import { setStatus } from './videos.js';
import { status as syncStatus, connect } from '../google/sync.js';
import { toast } from '../ui/toast.js';

const BACK = 2; // días hacia atrás que se ven en la línea de tiempo
const DAYS = 21;
const MAX_LANES = 6;

function sentence() {
  const s = summary();
  if (!store.videos().length && !store.events().length) return 'Tu mesa de edición está vacía. Empieza por añadir el video que tienes entre manos.';
  const parts = [];
  if (s.late) parts.push(`<b class="late">${plural(s.late, 'video atrasado', 'videos atrasados')}</b>`);
  if (s.week) parts.push(`<b>${plural(s.week, 'entrega', 'entregas')}</b> en los próximos 7 días`);
  if (s.shootsToday) parts.push(`<b>${plural(s.shootsToday, 'grabación', 'grabaciones')}</b> hoy`);
  else if (s.shootsTomorrow) parts.push(`<b>${plural(s.shootsTomorrow, 'grabación', 'grabaciones')}</b> mañana`);
  if (!parts.length) return s.active ? `${plural(s.active, 'video en cola', 'videos en cola')}, nada urgente esta semana.` : 'Todo entregado. Buen momento para descansar la vista.';
  return `${parts.join(' · ')}.`;
}

/** Reparte barras en carriles sin que se pisen. */
function pack(bars) {
  const lanes = [];
  bars
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .forEach((bar) => {
      let i = lanes.findIndex((end) => end < bar.start);
      if (i === -1) {
        i = lanes.length;
        lanes.push(-1);
      }
      lanes[i] = bar.end;
      bar.lane = i;
    });
  return lanes.length;
}

function timelineHtml() {
  const t = today();
  const from = addDays(t, -BACK);
  const to = addDays(from, DAYS - 1);
  const idx = (date) => diffDays(date, from);

  // Carril de entregas: cada video ocupa desde que lo empezaste (o hoy) hasta su fecha.
  const bars = activeVideos()
    .filter((v) => v.due)
    .map((v) => {
      const info = dueInfo(v);
      const late = info.tone === 'late';
      const begun = ymd(new Date(v.startedAt || v.createdAt));
      const startDate = begun < t ? begun : t;
      const endDate = late ? t : v.due;
      return { v, late, info, start: Math.max(0, idx(startDate)), end: Math.min(DAYS - 1, idx(endDate)), cut: idx(endDate) > DAYS - 1 };
    })
    .filter((b) => b.end >= 0 && b.start <= DAYS - 1 && b.end >= b.start);
  const laneCount = pack(bars);
  const visible = bars.filter((b) => b.lane < MAX_LANES);
  const overflow = bars.length - visible.length;

  const items = dayItems(from, to);
  const evBars = [];
  const seen = new Set();
  items.forEach((list, date) => {
    list.forEach((it) => {
      if (it.kind === 'video') return;
      const key = `${it.kind}:${it.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const total = it.span ? Number(it.span.split('/')[1]) : 1;
      const first = it.span ? Number(it.span.split('/')[0]) : 1;
      const start = idx(date);
      const realEnd = Math.min(DAYS - 1, start + (total - first));
      const single = realEnd === start;
      // Un evento de un día es un marcador: su texto se extiende hacia la derecha si hay sitio.
      const room = single ? Math.ceil((it.title.length * 6.6 + (it.time ? 78 : 40)) / 52) - 1 : 0;
      evBars.push({ it, single, start, end: Math.min(DAYS - 1, realEnd + Math.min(room, 4)) });
    });
  });
  const evLanes = pack(evBars);

  const head = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(from, i);
    const d = parseYmd(date);
    // El día 1 muestra el mes en lugar del día de la semana.
    const label = d.getDate() === 1 ? `<span class="tl__month">${MESES_CORTO[d.getMonth()]}</span>` : `<span>${DIAS_CORTO[d.getDay()]}</span>`;
    return `<div class="tl__day ${date === t ? 'is-today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : ''}">${label}<b>${d.getDate()}</b></div>`;
  }).join('');

  const bg = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(from, i);
    const d = parseYmd(date);
    return `<i class="${date === t ? 'is-today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : ''} ${date < t ? 'is-past' : ''}"></i>`;
  }).join('');

  const now = new Date();
  const playhead = ((BACK + (now.getHours() * 60 + now.getMinutes()) / 1440) / DAYS) * 100;

  const clip = (b, i) => {
    const p = progress(b.v);
    return `<button type="button" class="clip st--${b.v.status} ${b.late ? 'clip--late' : ''} ${b.cut ? 'clip--cut' : ''}" style="grid-column:${b.start + 1}/${b.end + 2};grid-row:${b.lane + 1};--i:${i}"
      data-action="open-video" data-id="${b.v.id}" title="${esc(b.v.title)} · ${esc(b.info.label)}">
      ${p.total ? `<i class="clip__fill" style="transform:scaleX(${p.ratio})"></i>` : ''}
      <span class="clip__label">${esc(b.v.title || 'Sin título')}</span>
      <span class="clip__end">${icon(b.late ? 'warn' : 'flag', 13)}</span>
    </button>`;
  };

  const evClip = (b, i) => {
    const time = b.it.time ? `<time>${fmtTime(b.it.time).replace(':00', '').replace(' ', '')}</time> ` : '';
    const attrs = `style="grid-column:${b.start + 1}/${b.end + 2};grid-row:${b.lane + 1};--i:${i}" data-action="open-item" data-kind="${b.it.kind}" data-id="${esc(b.it.id)}" title="${esc(b.it.title)}"`;
    return b.single
      ? `<button type="button" class="mark ${chipClass(b.it)}" ${attrs}><span class="mark__pin">${eventIcon(b.it, 14)}</span><span class="clip__label">${time}${esc(b.it.title)}</span></button>`
      : `<button type="button" class="clip clip--event ${chipClass(b.it)}" ${attrs}>${eventIcon(b.it, 13)}<span class="clip__label">${time}${esc(b.it.title)}</span></button>`;
  };

  return `
    <section class="tl" aria-label="Línea de tiempo de las próximas tres semanas" style="--days:${DAYS}">
      <div class="tl__scroll" data-tl-scroll>
        <div class="tl__inner">
          <div class="tl__head">${head}</div>
          <div class="tl__body">
            <div class="tl__bg" aria-hidden="true">${bg}</div>
            <div class="tl__track">
              <p class="tl__name">Agenda</p>
              <div class="tl__lanes" style="--lanes:${Math.max(1, evLanes)}">
                ${evBars.length ? evBars.map(evClip).join('') : `<span class="tl__none">Sin grabaciones ni eventos en estas tres semanas</span>`}
              </div>
            </div>
            <div class="tl__track">
              <p class="tl__name">Entregas</p>
              <div class="tl__lanes" style="--lanes:${Math.max(1, Math.min(laneCount, MAX_LANES))}">
                ${visible.length ? visible.map(clip).join('') : `<span class="tl__none">Ningún video con fecha de entrega en este tramo</span>`}
              </div>
              ${overflow > 0 ? `<a class="tl__more" href="#/videos">y ${overflow} más en Videos</a>` : ''}
            </div>
            <div class="tl__playhead" style="left:${playhead.toFixed(3)}%" aria-hidden="true"><b>${fmtTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`)}</b></div>
          </div>
        </div>
      </div>
    </section>`;
}

function nextHtml() {
  const vids = activeVideos();
  const dated = vids.filter((v) => v.due).sort((a, b) => a.due.localeCompare(b.due) || (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  const undated = vids.filter((v) => !v.due);
  const list = dated.slice(0, 6);
  if (!vids.length) {
    return empty({
      title: 'Nada en cola',
      text: 'Cuando añadas un video con fecha de entrega aparecerá aquí, ordenado por urgencia.',
      action: `<button type="button" class="btn btn--primary" data-action="new-video">${icon('plus')}Nuevo video</button>`,
    });
  }
  const row = (v) => {
    const info = dueInfo(v);
    const d = v.due ? parseYmd(v.due) : null;
    const next = nextStatus(v.status);
    const meta = [v.client, v.type].filter(Boolean).map(esc).join(' · ');
    return `
      <li class="nrow ${info.tone === 'late' ? 'nrow--late' : ''} ${info.tone === 'today' ? 'nrow--today' : ''}" data-flip="n-${v.id}">
        <div class="nrow__date" aria-hidden="true">${d ? `<b>${d.getDate()}</b><span>${MESES_CORTO[d.getMonth()]}</span>` : '<b>–</b>'}</div>
        <div class="nrow__main">
          <button type="button" class="nrow__open" data-action="open-video" data-id="${v.id}">${esc(v.title) || '<em>Sin título</em>'}</button>
          <div class="nrow__meta">${statusChip(v.status)}${meta ? `<span>${meta}</span>` : ''}${perf(v)}</div>
        </div>
        <div class="nrow__when"><b>${esc(v.due ? cap(countdown(v)) : 'Sin fecha')}</b><span>${esc(info.tone === 'late' ? 'Atrasado' : v.due ? `${cap(DIAS[d.getDay()])}${v.dueTime ? ` · ${fmtTime(v.dueTime)}` : ''}` : '')}</span></div>
        ${next ? `<button type="button" class="btn btn--sm nrow__adv" data-action="advance" data-id="${v.id}" title="Pasar a ${esc(next.label)}">${esc(ADVANCE[next.id])}${icon('arrow', 15)}</button>` : ''}
      </li>`;
  };
  return `
    <ol class="next">${list.map(row).join('')}</ol>
    ${dated.length > list.length || undated.length ? `<p class="section__foot"><a href="#/videos">${[dated.length > list.length ? `${dated.length - list.length} más con fecha` : '', undated.length ? `${undated.length} sin fecha` : ''].filter(Boolean).join(' y ')} →</a></p>` : ''}`;
}

function agendaHtml() {
  const t = today();
  const to = addDays(t, 7);
  const items = dayItems(t, to);
  const days = [...items.keys()].sort().filter((d) => items.get(d).some((i) => i.kind !== 'video'));
  if (!days.length) {
    return `<p class="quiet-note">Sin grabaciones ni eventos esta semana.</p>
      <button type="button" class="btn btn--sm" data-action="new-event">${icon('plus', 16)}Apartar una fecha</button>`;
  }
  return `<div class="mini-agenda">${days
    .map((date) => {
      const d = parseYmd(date);
      const rel = diffDays(date, t);
      const label = rel === 0 ? 'Hoy' : rel === 1 ? 'Mañana' : `${cap(DIAS[d.getDay()])} ${d.getDate()}`;
      return `<div class="mini-day"><p class="mini-day__label ${rel === 0 ? 'is-today' : ''}">${label}</p><ul>${items
        .get(date)
        .filter((i) => i.kind !== 'video')
        .map(
          (it) => `<li><button type="button" class="mini-ev ${chipClass(it)}" data-action="open-item" data-kind="${it.kind}" data-id="${esc(it.id)}">
            <span class="mini-ev__ic">${eventIcon(it, 15)}</span>
            <span class="mini-ev__main"><b>${esc(it.title)}</b><span>${[it.allDay ? 'Todo el día' : fmtTime(it.time), it.sub].filter(Boolean).map(esc).join(' · ')}</span></span>
          </button></li>`,
        )
        .join('')}</ul></div>`;
    })
    .join('')}</div>`;
}

function stateHtml() {
  const all = store.videos();
  const act = all.filter((v) => v.status !== 'entregado');
  const counts = STATUSES.slice(0, 3).map((s) => ({ ...s, n: act.filter((v) => v.status === s.id).length }));
  const total = act.length;
  const u = unpaid();
  const month = deliveredThisMonth();
  const cur = store.settings.currency;
  return `
    ${
      total
        ? `<div class="mix" role="img" aria-label="${counts.map((c) => `${c.n} ${c.label.toLowerCase()}`).join(', ')}">${counts
            .filter((c) => c.n)
            .map((c) => `<i class="st--${c.id}" style="flex:${c.n}"></i>`)
            .join('')}</div>`
        : ''
    }
    <ul class="mix-legend">
      ${counts.map((c) => `<li class="st--${c.id}"><i></i>${esc(c.label)}<b>${c.n}</b></li>`).join('')}
      <li class="st--entregado"><i></i>Entregados este mes<b>${month}</b></li>
    </ul>
    ${u.count ? `<p class="owed">${icon('money', 16)}<span>Por cobrar: <b>${esc(money(u.total, cur))}</b> en ${plural(u.count, 'video', 'videos')}</span></p>` : ''}`;
}

export function mount(el) {
  const d = new Date();
  el.innerHTML = `
    <header class="vh vh--hoy">
      <div>
        <p class="vh__eyebrow">${cap(DIAS[d.getDay()])}</p>
        <h1 class="vh__title">${d.getDate()} <span>de ${MESES[d.getMonth()]}</span></h1>
        <p class="vh__lead" data-sentence></p>
      </div>
      <div class="vh__actions">
        <button type="button" class="btn" data-action="new-event">${icon('calendar')}Nuevo evento</button>
        <button type="button" class="btn btn--primary" data-action="new-video">${icon('plus')}Nuevo video<kbd>N</kbd></button>
      </div>
    </header>
    <div data-banner></div>
    <div data-timeline></div>
    <div class="hoy-grid">
      <section class="section" aria-labelledby="h-next">
        <h2 class="section__title" id="h-next">Lo próximo</h2>
        <div data-next></div>
      </section>
      <div class="hoy-side">
        <section class="section" aria-labelledby="h-agenda">
          <h2 class="section__title" id="h-agenda">Agenda de la semana</h2>
          <div class="stack" data-agenda></div>
        </section>
        <section class="section" aria-labelledby="h-state">
          <h2 class="section__title" id="h-state">En la mesa</h2>
          <div class="stack" data-state></div>
        </section>
      </div>
    </div>`;

  let first = true;

  function banner() {
    const s = syncStatus();
    const box = $('[data-banner]', el);
    if (s.phase === 'expired') {
      box.innerHTML = `<div class="banner"><span>${icon('warn')}La sesión de Google caducó: tu calendario no se está actualizando.</span><button type="button" class="btn btn--sm" data-action="reconnect">Reconectar</button></div>`;
    } else if (store.hasSamples()) {
      box.innerHTML = `<div class="banner banner--plain"><span>${icon('note')}Estás viendo datos de ejemplo.</span><button type="button" class="btn btn--sm" data-action="clear-samples">Quitar ejemplos</button></div>`;
    } else if (!store.videos().length && !store.events().length) {
      box.innerHTML = `<div class="banner banner--plain"><span>${icon('note')}¿Quieres ver cómo queda con contenido?</span><button type="button" class="btn btn--sm" data-action="samples">Cargar datos de ejemplo</button></div>`;
    } else {
      box.innerHTML = '';
    }
  }

  function draw() {
    $('[data-sentence]', el).innerHTML = sentence();
    banner();
    const tl = $('[data-timeline]', el);
    const scroller = $('[data-tl-scroll]', tl);
    const x = scroller?.scrollLeft || 0;
    tl.innerHTML = timelineHtml();
    $('[data-tl-scroll]', tl).scrollLeft = x;
    tl.classList.toggle('is-first', first && !reducedMotion());
    const next = $('[data-next]', el);
    flip(next, () => (next.innerHTML = nextHtml()));
    $('[data-agenda]', el).innerHTML = agendaHtml();
    $('[data-state]', el).innerHTML = stateHtml();
    first = false;
  }

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'open-video') openVideoSheet(t.dataset.id);
    else if (a === 'open-item') openItem({ kind: t.dataset.kind, id: t.dataset.id });
    else if (a === 'new-video') newVideo();
    else if (a === 'new-event') newEvent();
    else if (a === 'advance') {
      const v = store.video(t.dataset.id);
      const next = v && nextStatus(v.status);
      if (next) setStatus(v.id, next.id);
    } else if (a === 'samples') {
      (await import('../samples.js')).loadSamples();
    } else if (a === 'clear-samples') {
      store.removeSamples();
    } else if (a === 'reconnect') {
      try {
        await connect();
        toast('Google reconectado');
      } catch (err) {
        toast(err.message, { tone: 'error' });
      }
    }
  });

  draw();
  const tick = setInterval(() => !document.hidden && draw(), 5 * 60 * 1000);

  return {
    update: draw,
    unmount: () => clearInterval(tick),
  };
}
