import { one, query } from '../db/pool.js';

/**
 * Valida si una coordenada está dentro de la geocerca de una obra.
 * Usa PostGIS ST_DWithin (distancia real sobre geografía, en metros).
 *
 * @returns { dentro: boolean, distancia_m: number, obra: {...} }
 */
export async function validarGeocerca(obraId, lat, lon) {
  const obra = await one(`SELECT id, nombre, radio_metros FROM obras WHERE id = $1 AND activa = true`, [
    obraId,
  ]);
  if (!obra) return { dentro: false, distancia_m: null, obra: null, error: 'obra_no_encontrada' };

  const row = await one(
    `SELECT
        ST_Distance(ubicacion, ST_MakePoint($2,$3)::geography) AS distancia_m,
        ST_DWithin(ubicacion, ST_MakePoint($2,$3)::geography, radio_metros) AS dentro
       FROM obras WHERE id = $1`,
    [obraId, lon, lat] // ST_MakePoint recibe (x=lon, y=lat)
  );

  return {
    dentro: row.dentro,
    distancia_m: Math.round(row.distancia_m),
    obra,
  };
}

/** Devuelve la obra más cercana a una coordenada dentro de su propio radio (si existe). */
export async function obraCercana(empresaId, lat, lon) {
  return one(
    `SELECT id, nombre, radio_metros,
            ST_Distance(ubicacion, ST_MakePoint($2,$3)::geography) AS distancia_m
       FROM obras
      WHERE empresa_id = $1 AND activa = true
        AND ST_DWithin(ubicacion, ST_MakePoint($2,$3)::geography, radio_metros)
      ORDER BY distancia_m ASC LIMIT 1`,
    [empresaId, lon, lat]
  );
}

/** Crea una obra/geocerca. */
export async function crearObra({ empresaId, nombre, tipo, lat, lon, radio_metros }) {
  return one(
    `INSERT INTO obras (empresa_id, nombre, tipo, ubicacion, radio_metros)
     VALUES ($1,$2,$3, ST_MakePoint($4,$5)::geography, $6)
     RETURNING id, nombre, radio_metros`,
    [empresaId, nombre, tipo || 'obra', lon, lat, radio_metros || 100]
  );
}
