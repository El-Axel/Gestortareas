// Arrastrar con el mouse o lápiz. En pantallas táctiles no se activa (ahí el dedo
// hace scroll): el cambio de estado se hace con el botón de avanzar o desde el panel.

import { $$, reducedMotion, EASE } from '../util.js';

const THRESHOLD = 6;

function makeGhost(el, rect) {
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('data-flip');
  ghost.classList.add('is-ghost');
  Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: 0, zIndex: 1000, pointerEvents: 'none' });
  document.body.append(ghost);
  return ghost;
}

function swallowNextClick() {
  const stop = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 80);
}

/** Lógica común: umbral, fantasma que sigue al puntero, Esc para cancelar. */
function track(e, el, { onStart, onMove, onEnd, tilt = 2 }) {
  const startX = e.clientX;
  const startY = e.clientY;
  let ghost = null;
  let rect = null;
  let last = e;
  let raf = 0;

  const move = (ev) => {
    last = ev;
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
      rect = el.getBoundingClientRect();
      ghost = makeGhost(el, rect);
      document.body.classList.add('is-dragging');
      onStart?.();
      autoscroll();
    }
    ghost.style.transform = `translate3d(${ev.clientX - startX}px, ${ev.clientY - startY}px, 0) rotate(${tilt}deg)`;
    onMove(ev);
  };

  // Acerca la página cuando el puntero llega al borde superior o inferior.
  const autoscroll = () => {
    const edge = 72;
    const y = last.clientY;
    const speed = y < edge ? -(edge - y) / 5 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 5 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      onMove(last);
    }
    raf = requestAnimationFrame(autoscroll);
  };

  const stop = (cancelled) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    cancelAnimationFrame(raf);
    if (!ghost) return;
    swallowNextClick();
    const target = onEnd(cancelled);
    const done = () => {
      ghost.remove();
      document.body.classList.remove('is-dragging');
      target?.after?.();
    };
    const to = target?.rect;
    if (!to || reducedMotion()) {
      done();
      return;
    }
    ghost.animate([{ transform: ghost.style.transform }, { transform: `translate3d(${to.left - rect.left}px, ${to.top - rect.top}px, 0) rotate(0deg)` }], { duration: 220, easing: EASE }).onfinish = done;
  };
  const up = () => stop(false);
  const cancel = () => stop(true);
  const key = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      stop(true);
    }
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
}

/**
 * Tablero: las tarjetas [data-card] se mueven entre listas [data-list] (dentro de [data-col]).
 * onDrop({ id, status, beforeId }) se llama cuando la tarjeta ya aterrizó.
 */
export function boardDrag(root, { onDrop, onSettle, reorder = () => true }) {
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const card = e.target.closest('[data-card]');
    if (!card || e.target.closest('[data-nodrag]')) return;

    const home = { parent: card.parentNode, next: card.nextElementSibling };
    const board = card.closest('[data-board]');
    let overCol = null;

    const place = (list, before) => {
      if (card.parentNode === list && card.nextElementSibling === before) return;
      const cards = $$('[data-card]', board).filter((c) => c !== card);
      const rects = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
      list.insertBefore(card, before);
      if (reducedMotion()) return;
      cards.forEach((c) => {
        const a = rects.get(c);
        const b = c.getBoundingClientRect();
        const dy = a.top - b.top;
        if (Math.abs(dy) > 1) c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
      });
    };

    track(e, card, {
      onStart: () => card.classList.add('is-placeholder'),
      onMove: (ev) => {
        const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-col]');
        if (col !== overCol) {
          overCol?.classList.remove('is-over');
          col?.classList.add('is-over');
          overCol = col;
        }
        if (!col) return;
        const list = col.querySelector('[data-list]');
        if (!reorder() && list !== home.parent) {
          // Con orden automático solo importa la columna.
          place(list, null);
          return;
        }
        if (!reorder()) {
          place(home.parent, home.next);
          return;
        }
        const others = $$('[data-card]', list).filter((c) => c !== card);
        const before = others.find((c) => {
          const r = c.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        place(list, before || null);
      },
      onEnd: (cancelled) => {
        overCol?.classList.remove('is-over');
        if (cancelled) place(home.parent, home.next);
        const rect = card.getBoundingClientRect();
        return {
          rect,
          after: () => {
            card.classList.remove('is-placeholder');
            if (cancelled) return onSettle?.();
            const status = card.closest('[data-col]')?.dataset.col;
            const beforeId = card.nextElementSibling?.matches?.('[data-card]') ? card.nextElementSibling.dataset.id : null;
            const afterId = card.previousElementSibling?.matches?.('[data-card]') ? card.previousElementSibling.dataset.id : null;
            const moved = card.parentNode !== home.parent || card.nextElementSibling !== home.next;
            if (moved && status) onDrop({ id: card.dataset.id, status, beforeId, afterId });
            onSettle?.();
          },
        };
      },
    });
  });
}

/**
 * Calendario: las fichas [data-chip] se sueltan sobre un día [data-day].
 * onDrop({ kind, id, date })
 */
export function chipDrag(root, { onDrop, onSettle }) {
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const chip = e.target.closest('[data-chip][data-movable]');
    if (!chip) return;
    const from = chip.closest('[data-day]')?.dataset.day;
    let over = null;

    track(e, chip, {
      tilt: 0,
      onStart: () => chip.classList.add('is-placeholder'),
      onMove: (ev) => {
        const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-day]');
        if (cell === over) return;
        over?.classList.remove('is-over');
        cell?.classList.add('is-over');
        over = cell;
      },
      onEnd: (cancelled) => {
        over?.classList.remove('is-over');
        const date = over?.dataset.day;
        const ok = !cancelled && date && date !== from;
        return {
          rect: ok ? null : chip.getBoundingClientRect(),
          after: () => {
            chip.classList.remove('is-placeholder');
            if (ok) onDrop({ kind: chip.dataset.kind, id: chip.dataset.id, date, from });
            onSettle?.();
          },
        };
      },
    });
  });
}
