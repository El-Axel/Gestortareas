// Panel lateral (en el celular sube desde abajo) para editar un video o un evento.
// Usa <dialog>: el navegador se encarga del foco, de Esc y de bloquear el fondo.

import { reducedMotion } from '../util.js';
import { icon } from './icons.js';

let current = null;

export function closeSheet() {
  return current?.close();
}

export const sheetOpen = () => !!current;

/**
 * @param {{ label: string, head?: string, body: string, onMount?: (el: HTMLElement, api: object) => void, onClose?: () => void }} opts
 */
export function openSheet({ label, head = '', body, onMount, onClose }) {
  if (current) current.close(true);

  const opener = document.activeElement;
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-label', label);
  dlg.innerHTML = `
    <div class="sheet__head">
      <div class="sheet__head-main">${head}</div>
      <button type="button" class="btn btn--icon btn--quiet" data-close aria-label="Cerrar">${icon('x', 20)}</button>
    </div>
    <div class="sheet__body">${body}</div>`;
  document.body.append(dlg);

  let closing = false;
  // Los avisos viven dentro del panel mientras está abierto: si no, quedarían tapados y sin poder pulsarse.
  const toasts = document.getElementById('toasts');
  const finish = () => {
    if (toasts && dlg.contains(toasts)) document.body.append(toasts);
    dlg.close();
    dlg.remove();
    if (current === api) current = null;
    onClose?.();
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  };
  const close = (instant = false) => {
    if (closing) return;
    closing = true;
    // Guarda lo que esté a medio escribir antes de cerrar.
    if (document.activeElement && dlg.contains(document.activeElement)) document.activeElement.blur();
    if (instant || reducedMotion()) {
      finish();
      return;
    }
    dlg.classList.add('is-closing');
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      finish();
    };
    dlg.addEventListener('animationend', (e) => e.target === dlg && end());
    setTimeout(end, 320);
  };

  const api = { el: dlg, close };
  current = api;

  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // clic en el fondo oscuro
    else if (e.target.closest('[data-close]')) close();
  });

  dlg.showModal();
  if (toasts) dlg.append(toasts);
  onMount?.(dlg, api);
  return api;
}
