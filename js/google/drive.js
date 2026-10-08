// Copia de tus datos en la carpeta privada de la app en Google Drive (appDataFolder).
// Esa carpeta no aparece en tu Drive ni la ven otras apps; solo sirve para que
// el computador y el celular compartan el mismo tablero.

import { gfetch } from './auth.js';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const NAME = 'claqueta-datos.json';

export async function findFile() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name = '${NAME}' and trashed = false`, fields: 'files(id,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '5' });
  const res = await gfetch(`${FILES}?${q}`);
  return res.files?.[0]?.id || '';
}

export async function download(fileId) {
  const text = await gfetch(`${FILES}/${encodeURIComponent(fileId)}?alt=media`, { as: 'text' });
  try {
    return JSON.parse(text || 'null');
  } catch {
    return null;
  }
}

export async function create(content) {
  const boundary = `claqueta${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: NAME, parents: ['appDataFolder'], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const res = await gfetch(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } });
  return res.id;
}

export function update(fileId, content) {
  return gfetch(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=id`, { method: 'PATCH', body: content, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
}
