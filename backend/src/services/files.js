import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

/** Guarda un buffer en /uploads y devuelve la ruta relativa servible. */
export function guardarArchivo(buffer, mimetype, prefix = 'archivo') {
  const ext = EXT[mimetype] || '';
  const nombre = `${prefix}_${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, nombre), buffer);
  return `/uploads/${nombre}`;
}

export { UPLOAD_DIR };
