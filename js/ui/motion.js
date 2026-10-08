// Movimiento: FLIP para que las tarjetas viajen a su nuevo sitio en vez de saltar,
// y el "clac" de la claqueta cuando entregas un video.

import { reducedMotion, EASE, $$ } from '../util.js';

/**
 * Ejecuta `mutate` (que cambia el DOM) y anima cada [data-flip] desde donde estaba.
 * Los elementos nuevos entran con un fundido corto.
 */
export function flip(root, mutate, { duration = 340 } = {}) {
  if (reducedMotion() || !root.isConnected) {
    mutate();
    return;
  }
  const before = new Map();
  $$('[data-flip]', root).forEach((el) => before.set(el.dataset.flip, el.getBoundingClientRect()));
  const hadContent = before.size > 0;
  mutate();
  const vh = window.innerHeight;
  $$('[data-flip]', root).forEach((el) => {
    const was = before.get(el.dataset.flip);
    const now = el.getBoundingClientRect();
    if (!was) {
      if (hadContent && now.top < vh) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 280, easing: EASE },
        );
      }
      return;
    }
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    if ((was.top > vh && now.top > vh) || (was.bottom < 0 && now.bottom < 0)) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing: EASE });
  });
}

/** Guarda foco, texto y cursor del campo activo mientras se redibuja su contenedor. */
export function keepFocus(root, mutate) {
  const a = document.activeElement;
  const key = a && root.contains(a) ? a.dataset.keep : null;
  const snap = key ? { value: a.value, start: a.selectionStart, end: a.selectionEnd } : null;
  mutate();
  if (!key) return;
  const el = root.querySelector(`[data-keep="${key}"]`);
  if (!el) return;
  if (snap.value != null && el.value !== snap.value && el.tagName !== 'SELECT') el.value = snap.value;
  el.focus({ preventScroll: true });
  try {
    if (snap.start != null) el.setSelectionRange(snap.start, snap.end);
  } catch {
    /* tipos de campo sin selección */
  }
}

/** Cierra la claqueta del logo: es la señal de "toma buena". */
export function clap() {
  document.querySelectorAll('.brand .clap').forEach((el) => {
    el.classList.remove('is-clapping');
    void el.getBoundingClientRect();
    el.classList.add('is-clapping');
  });
}

/** Entrada escalonada de una vista recién montada. */
export function enter(viewEl) {
  if (reducedMotion()) return;
  [...viewEl.children].forEach((child, i) => {
    child.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 520, delay: Math.min(i, 6) * 55, easing: EASE, fill: 'backwards' },
    );
  });
}
