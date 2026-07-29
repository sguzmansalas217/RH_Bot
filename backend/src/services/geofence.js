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

/**
 * De las obras ASIGNADAS al empleado, elige la que corresponde a un punto GPS:
 * prioriza una donde el punto caiga dentro del radio; si ninguna, la más cercana.
 * @returns null si el empleado no tiene obras asignadas, o { id, nombre, distancia_m, dentro }.
 */
export async function obraEmpleadoEnPunto(empleadoId, lat, lon) {
  const row = await one(
    `SELECT o.id, o.nombre, o.radio_metros,
            ST_Distance(o.ubicacion, ST_MakePoint($2,$3)::geography) AS distancia_m,
            ST_DWithin(o.ubicacion, ST_MakePoint($2,$3)::geography, o.radio_metros) AS dentro
       FROM empleado_obras eo
       JOIN obras o ON o.id = eo.obra_id
      WHERE eo.empleado_id = $1 AND o.activa = true
      ORDER BY dentro DESC, distancia_m ASC
      LIMIT 1`,
    [empleadoId, lon, lat] // ST_MakePoint recibe (x=lon, y=lat)
  );
  if (!row) return null;
  return { id: row.id, nombre: row.nombre, distancia_m: Math.round(row.distancia_m), dentro: row.dentro };
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
