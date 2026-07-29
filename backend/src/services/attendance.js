import { one, query } from '../db/pool.js';
import { obraEmpleadoEnPunto } from './geofence.js';

/** Config de la empresa (tolerancias, jornada). */
function getEmpresa(empresaId) {
  return one(`SELECT * FROM empresas WHERE id = $1`, [empresaId]);
}

// Convierte una hora "HH:MM:SS" en minutos desde medianoche
function horaAMin(hhmmss) {
  if (!hhmmss) return null;
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
}

// Minutos desde medianoche de un Date en hora local del servidor
function minDelDia(date) {
  return date.getHours() * 60 + date.getMinutes();
}

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Registra ENTRADA. Valida geocerca; usa hora oficial del servidor.
 * @returns { ok, motivo, distancia_m, retardo_min, asistencia }
 */
export async function registrarEntrada(empleado, lat, lon) {
  // Detecta en cuál de las obras asignadas está el empleado
  const geo = await obraEmpleadoEnPunto(empleado.id, lat, lon);
  if (!geo) return { ok: false, motivo: 'sin_obra' };
  if (!geo.dentro) {
    await crearIncidencia(empleado.id, 'fuera_geocerca', `Entrada fuera de geocerca (${geo.distancia_m} m)`);
    return { ok: false, motivo: 'fuera_geocerca', distancia_m: geo.distancia_m };
  }
  const obraId = geo.id;

  const empresa = await getEmpresa(empleado.empresa_id);
  const ahora = new Date(); // hora OFICIAL del servidor
  const fecha = hoyLocal();

  // Retardo respecto a hora_entrada + tolerancia
  let retardo = 0;
  const entradaProg = horaAMin(empleado.hora_entrada);
  if (entradaProg != null) {
    const tol = empresa?.tolerancia_retardo_min ?? 10;
    retardo = Math.max(0, minDelDia(ahora) - (entradaProg + tol));
  }

  const existente = await one(`SELECT * FROM asistencias WHERE empleado_id=$1 AND fecha=$2`, [
    empleado.id,
    fecha,
  ]);
  if (existente?.entrada) {
    return { ok: false, motivo: 'ya_registro_entrada', asistencia: existente };
  }

  const asistencia = await one(
    `INSERT INTO asistencias
       (empleado_id, obra_id, fecha, entrada, ubicacion_entrada, distancia_entrada_m, minutos_retardo, estatus)
     VALUES ($1,$2,$3, now(), ST_MakePoint($4,$5)::geography, $6, $7, 'abierta')
     ON CONFLICT (empleado_id, fecha) DO UPDATE
       SET entrada = now(), ubicacion_entrada = ST_MakePoint($4,$5)::geography,
           distancia_entrada_m = $6, minutos_retardo = $7, estatus='abierta'
     RETURNING *`,
    [empleado.id, obraId, fecha, lon, lat, geo.distancia_m, retardo]
  );

  if (retardo > 0) {
    await crearIncidencia(empleado.id, 'retardo', `Retardo de ${retardo} min`);
  }

  return { ok: true, distancia_m: geo.distancia_m, retardo_min: retardo, asistencia, hora: ahora, obra_nombre: geo.nombre };
}

/**
 * Registra SALIDA. Calcula horas trabajadas, extra y salida anticipada.
 */
export async function registrarSalida(empleado, lat, lon) {
  const fecha = hoyLocal();

  const asistencia = await one(`SELECT * FROM asistencias WHERE empleado_id=$1 AND fecha=$2`, [
    empleado.id,
    fecha,
  ]);
  if (!asistencia?.entrada) return { ok: false, motivo: 'sin_entrada' };
  if (asistencia.salida) return { ok: false, motivo: 'ya_registro_salida', asistencia };

  const geo = await obraEmpleadoEnPunto(empleado.id, lat, lon);
  if (!geo) return { ok: false, motivo: 'sin_obra' };
  if (!geo.dentro) {
    await crearIncidencia(empleado.id, 'fuera_geocerca', `Salida fuera de geocerca (${geo.distancia_m} m)`);
    return { ok: false, motivo: 'fuera_geocerca', distancia_m: geo.distancia_m };
  }

  const empresa = await getEmpresa(empleado.empresa_id);
  const ahora = new Date();
  const entrada = new Date(asistencia.entrada);

  // Horas trabajadas = (salida - entrada) - comida
  const comidaMin = empleado.minutos_comida ?? 60;
  let horas = (ahora - entrada) / 3_600_000 - comidaMin / 60;
  horas = Math.max(0, Math.round(horas * 100) / 100);

  const jornada = Number(empresa?.horas_jornada ?? 8);
  const horasExtra = Math.max(0, Math.round((horas - jornada) * 100) / 100);

  // Salida anticipada respecto a hora_salida
  let anticipada = 0;
  const salidaProg = horaAMin(empleado.hora_salida);
  if (salidaProg != null) anticipada = Math.max(0, salidaProg - minDelDia(ahora));

  const actualizada = await one(
    `UPDATE asistencias SET
        salida = now(),
        ubicacion_salida = ST_MakePoint($2,$3)::geography,
        distancia_salida_m = $4,
        horas_trabajadas = $5,
        horas_extra = $6,
        salida_anticipada_min = $7,
        estatus = 'cerrada'
      WHERE id = $1 RETURNING *`,
    [asistencia.id, lon, lat, geo.distancia_m, horas, horasExtra, anticipada]
  );

  if (anticipada > 0) {
    await crearIncidencia(empleado.id, 'salida_anticipada', `Salida anticipada de ${anticipada} min`);
  }

  return {
    ok: true,
    distancia_m: geo.distancia_m,
    horas_trabajadas: horas,
    horas_extra: horasExtra,
    salida_anticipada_min: anticipada,
    asistencia: actualizada,
    hora: ahora,
  };
}

export function crearIncidencia(empleadoId, tipo, descripcion) {
  return query(
    `INSERT INTO incidencias (empleado_id, tipo, descripcion) VALUES ($1,$2,$3)`,
    [empleadoId, tipo, descripcion]
  );
}

/**
 * Resumen de trabajo de un empleado en un rango de fechas:
 * días trabajados, horas normales y horas extra.
 */
export async function resumenTrabajo(empleadoId, inicio, fin) {
  const r = await one(
    `SELECT COUNT(*) FILTER (WHERE entrada IS NOT NULL AND salida IS NOT NULL) AS dias,
            COALESCE(SUM(horas_trabajadas),0) AS horas,
            COALESCE(SUM(horas_extra),0) AS extra
       FROM asistencias
      WHERE empleado_id=$1 AND fecha BETWEEN $2 AND $3`,
    [empleadoId, inicio, fin]
  );
  const horas = Number(r.horas);
  const extra = Number(r.extra);
  return {
    dias: Number(r.dias),
    horas_totales: Math.round(horas * 100) / 100,
    horas_extra: Math.round(extra * 100) / 100,
    horas_normales: Math.max(0, Math.round((horas - extra) * 100) / 100),
  };
}

/** Suma de horas extra de la semana en curso (para consultas del empleado). */
export async function horasExtraSemana(empleadoId) {
  const r = await one(
    `SELECT COALESCE(SUM(horas_extra),0) AS total
       FROM asistencias
      WHERE empleado_id = $1 AND fecha >= date_trunc('week', CURRENT_DATE)`,
    [empleadoId]
  );
  return Number(r.total);
}
