// Tema claro/oscuro. El primer pintado lo hace theme-boot.js para que no haya parpadeo.

import { store } from './store.js';

const light = matchMedia('(prefers-color-scheme: light)');

export function applyTheme() {
  const pref = store.local.theme;
  const theme = pref === 'system' ? (light.matches ? 'light' : 'dark') : pref === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f1ea' : '#191613');
}

light.addEventListener('change', applyTheme);
