// Eventos que existen en Google Calendar pero no se crearon en Claqueta.
// Se guardan aparte como caché: se reemplazan enteros en cada sincronización.

const KEY = 'claqueta:remote:v1';

let list = [];
try {
  list = JSON.parse(localStorage.getItem(KEY) || '[]') || [];
} catch {
  list = [];
}

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sin espacio: la caché se vuelve a pedir */
  }
};

export const remoteEvents = () => list;
export const remoteEvent = (id) => list.find((e) => e.id === id);

export function setRemoteEvents(next) {
  list = next;
  save();
}

export function removeRemote(id) {
  list = list.filter((e) => e.id !== id);
  save();
}

export function clearRemote() {
  list = [];
  save();
}
