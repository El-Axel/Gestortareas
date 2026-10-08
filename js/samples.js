// Datos de ejemplo para ver la app con contenido. Se marcan con `sample: true`:
// no se envían a Google y se quitan de un clic.

import { store } from './store.js';
import { today, addDays, uid } from './util.js';

const steps = (done) => store.settings.checklist.map((text, i) => ({ id: uid().slice(0, 8), text, done: i < done }));

export function loadSamples() {
  const t = today();
  const now = Date.now();
  const day = 864e5;
  const vids = [
    { title: 'Boda Laura & Andrés — película completa', client: 'Laura Restrepo', type: 'Boda', status: 'proceso', priority: 'alta', due: addDays(t, 2), price: 2800000, checklist: steps(3), createdAt: now - 9 * day, startedAt: now - 5 * day, notes: 'Canción de entrada: la que mandó por WhatsApp. Quieren versión corta para Instagram.' },
    { title: 'Reel lanzamiento Café Origen', client: 'Café Origen', type: 'Reel', status: 'revision', due: addDays(t, 1), dueTime: '18:00', price: 450000, checklist: steps(5), createdAt: now - 6 * day, startedAt: now - 4 * day },
    { title: 'Podcast Ep. 14 — cortes verticales', client: 'Voces del Valle', type: 'Podcast', status: 'pendiente', due: addDays(t, 5), price: 380000, checklist: steps(0), createdAt: now - 2 * day },
    { title: 'Video corporativo Constructora Alba', client: 'Constructora Alba', type: 'Corporativo', status: 'pendiente', priority: 'alta', due: addDays(t, 9), price: 3200000, checklist: steps(0), createdAt: now - 1 * day },
    { title: 'Aftermovie Festival Río', client: 'Festival Río', type: 'Evento', status: 'proceso', due: addDays(t, 12), price: 1900000, checklist: steps(1), createdAt: now - 4 * day, startedAt: now - 1 * day },
    { title: 'Tutorial YouTube: iluminación con una sola luz', client: 'Canal propio', type: 'YouTube', status: 'pendiente', due: '', checklist: [], createdAt: now - 3 * day },
    { title: 'Testimonios clínica dental', client: 'Sonría', type: 'Comercial', status: 'pendiente', due: addDays(t, -1), price: 600000, checklist: steps(2), createdAt: now - 8 * day },
    { title: 'Reel menú de temporada', client: 'Café Origen', type: 'Reel', status: 'entregado', due: addDays(t, -4), price: 450000, paid: true, checklist: steps(6), createdAt: now - 14 * day, startedAt: now - 10 * day, deliveredAt: now - 4 * day },
    { title: 'Videoclip «Marea»', client: 'Los Nómadas', type: 'Videoclip', status: 'entregado', due: addDays(t, -8), price: 1500000, paid: false, checklist: steps(6), createdAt: now - 25 * day, startedAt: now - 20 * day, deliveredAt: now - 8 * day },
  ];
  vids.forEach((v, i) => store.data.videos.push({ id: uid(), dueTime: '', priority: 'normal', paid: false, price: null, notes: '', linkMaterial: '', linkEntrega: '', startedAt: 0, deliveredAt: 0, updatedAt: now, order: i, sample: true, ...v }));

  const evs = [
    { title: 'Grabación testimonios Sonría', type: 'grabacion', date: t, start: '14:00', end: '17:00', location: 'Clínica Sonría, Cl. 10 #43', client: 'Sonría' },
    { title: 'Llamada de revisión con Café Origen', type: 'reunion', date: addDays(t, 1), start: '10:30', end: '11:00', location: 'Google Meet', client: 'Café Origen' },
    { title: 'Rodaje Constructora Alba — obra', type: 'grabacion', date: addDays(t, 3), start: '07:00', end: '12:00', location: 'Proyecto Mirador, Envigado', client: 'Constructora Alba' },
    { title: 'Festival Río', type: 'evento', date: addDays(t, 6), endDate: addDays(t, 7), allDay: true, location: 'Parque del Río', client: 'Festival Río' },
    { title: 'Grabación podcast Ep. 15', type: 'grabacion', date: addDays(t, 10), start: '16:00', end: '18:00', location: 'Estudio Voces', client: 'Voces del Valle' },
    { title: 'Boda Camila & Jorge', type: 'grabacion', date: addDays(t, 16), allDay: true, location: 'Hacienda La Selva', client: 'Camila Duque' },
  ];
  evs.forEach((e) => store.data.events.push({ id: uid(), endDate: '', allDay: false, start: '09:00', end: '10:00', notes: '', videoId: '', createdAt: now, updatedAt: now, sample: true, ...e }));

  store.emit({ type: 'all' });
}
