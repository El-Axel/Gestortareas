// Iconos de trazo, dibujados para esta app. `icon('flag')` devuelve un <svg> como texto.

const P = {
  today: '<path d="M12 9v12"/><path d="M7 3h10v2.5L12 9 7 5.5z"/>',
  board: '<rect x="4" y="5" width="4.5" height="14" rx="1"/><rect x="9.75" y="5" width="4.5" height="8" rx="1"/><rect x="15.5" y="5" width="4.5" height="11" rx="1"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  settings: '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2.5 3.75L17 12H6"/>',
  camera: '<rect x="3.5" y="6.5" width="12.5" height="11" rx="2"/><path d="M16 10.5l4.5-2.5v8L16 13.5"/>',
  users: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.3a3 3 0 0 1 0 5.4M17.5 14.6a5 5 0 0 1 3 4.4"/>',
  star: '<path d="M12 4l2.4 5 5.6.7-4.1 3.8 1 5.5L12 16.3 7.1 19l1-5.5L4 9.7l5.6-.7z"/>',
  dot: '<circle cx="12" cy="12" r="3.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M11 7H6.5A1.5 1.5 0 0 0 5 8.5v9A1.5 1.5 0 0 0 6.5 19h9a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14-4.5L4 8.5M4 4.5v4h4M4 13a8 8 0 0 0 14 4.5l2-2M20 19.5v-4h-4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  pin: '<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.500-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
  money: '<path d="M12 4v16M16 8.2c0-1.5-1.8-2.7-4-2.700S8 6.700 8 8.400c0 4 8 2 8 6 0 1.700-1.800 2.900-4 2.900s-4-1.100-4-2.600"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 4v1.500M12 18.500V20M4 12h1.500M18.500 12H20M6.300 6.300l1.100 1.100M16.600 16.600l1.100 1.100M6.300 17.700l1.100-1.100M16.600 7.400l1.100-1.100"/>',
  moon: '<path d="M19.500 14.500A8 8 0 0 1 9.500 4.500a8 8 0 1 0 10 10z"/>',
  warn: '<path d="M12 4.500l8.500 14.500h-17z"/><path d="M12 10v4M12 16.700v.010"/>',
  cloud: '<path d="M7 18.500a4 4 0 0 1-.500-7.970A5.500 5.500 0 0 1 17.200 9.600 4.500 4.500 0 0 1 17 18.500z"/>',
  download: '<path d="M12 4v11M7.500 10.500L12 15l4.500-4.500M5 19h14"/>',
  upload: '<path d="M12 15V4M7.500 8.500L12 4l4.500 4.500M5 19h14"/>',
  up: '<path d="M6 14.500l6-6 6 6"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.500 7h.010M4.500 12h.010M4.500 17h.010"/>',
  note: '<path d="M6 4.500h12v15H6zM9 9h6M9 12.500h6M9 16h3"/>',
};

export function icon(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.dot}</svg>`;
}

/** La claqueta de la marca. La tablilla superior (.clap__stick) es la que se anima. */
export function clapper(size = 28) {
  return `<svg class="clap" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <g class="clap__stick">
      <path d="M4 7.500A1.500 1.500 0 0 1 5.500 6h21A1.500 1.500 0 0 1 28 7.500V12H4z" fill="currentColor"/>
      <path d="M8.500 6l-3 6M14.500 6l-3 6M20.500 6l-3 6M26.500 6l-3 6" stroke="var(--bg)" stroke-width="2"/>
    </g>
    <path d="M4 13.500h24v11A2.500 2.500 0 0 1 25.500 27h-19A2.500 2.500 0 0 1 4 24.500z" fill="currentColor"/>
  </svg>`;
}
