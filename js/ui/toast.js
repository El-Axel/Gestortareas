// Avisos breves abajo de la pantalla, con "Deshacer" cuando aplica.

import { esc, reducedMotion, EASE } from '../util.js';

let host;

function ensureHost() {
  if (!host) {
    host = document.getElementById('toasts');
  }
  return host;
}

export function toast(message, { action, onAction, tone = '', ms = 5000 } = {}) {
  const root = ensureHost();
  const el = document.createElement('div');
  el.className = `toast ${tone ? `toast--${tone}` : ''}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast__action">${esc(action)}</button>` : ''}`;
  root.append(el);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (reducedMotion()) {
      el.remove();
      return;
    }
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 180, easing: 'ease-in' }).onfinish = () => el.remove();
  };

  if (!reducedMotion()) {
    el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
  }
  const timer = setTimeout(close, action ? Math.max(ms, 6500) : ms);
  el.querySelector('.toast__action')?.addEventListener('click', () => {
    clearTimeout(timer);
    onAction?.();
    close();
  });
  return close;
}
