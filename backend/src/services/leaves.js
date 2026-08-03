import { one, query } from '../db/pool.js';

// Días naturales inclusive entre dos fechas YYYY-MM-DD
function diasEntre(inicio, fin) {
  const a = new Date(inicio + 'T00:00:00');
  const b = new Date((fin || inicio) + 'T00:00:00');
  return Math.floor((b - a) / 86_400_000) + 1;
}

// ─── PERMISOS ─────────────────────────────────────────────────────────────
export function solicitarPermiso(empleado, { fecha_inicio, fecha_fin, horas, motivo, tipo }) {
  return one(
    `INSERT INTO permisos (empleado_id, tipo, motivo, fecha_inicio, fecha_fin, horas)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      empleado.id,
      tipo || 'permiso',
      motivo || null,
      fecha_inicio || new Date().toISOString().slice(0, 10),
      fecha_fin || null,
      horas || null,
    ]
  );
}

// ─── VACACIONES ───────────────────────────────────────────────────────────
export async function solicitarVacaciones(empleado, { fecha_inicio, fecha_fin }) {
  const dias = diasEntre(fecha_inicio, fecha_fin);
  if (dias > Number(empleado.dias_vacaciones_saldo)) {
    return { ok: false, motivo: 'saldo_insuficiente', dias, saldo: empleado.dias_vacaciones_saldo };
  }
  const solicitud = await one(
    `INSERT INTO vacaciones (empleado_id, fecha_inicio, fecha_fin, dias)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [empleado.id, fecha_inicio, fecha_fin, dias]
  );
  return { ok: true, solicitud, dias };
}

export async function consultarVacaciones(empleado) {
  const { rows: historial } = await query(
    `SELECT fecha_inicio, fecha_fin, dias, estatus FROM vacaciones
      WHERE empleado_id=$1 ORDER BY fecha_inicio DESC LIMIT 5`,
    [empleado.id]
  );
  return { saldo: Number(empleado.dias_vacaciones_saldo), historial };
}

// ─── INCAPACIDADES ────────────────────────────────────────────────────────
export function reportarIncapacidad(empleado, { tipo, dias, fecha_inicio, folio_imss }) {
  const inicio = fecha_inicio || new Date().toISOString().slice(0, 10);
  const fin = dias ? new Date(new Date(inicio).getTime() + (dias - 1) * 86_400_000)
        .toISOString().slice(0, 10) : null;
  return one(
    `INSERT INTO incapacidades (empleado_id, tipo, dias, fecha_inicio, fecha_fin, folio_imss)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [empleado.id, tipo || 'enfermedad', dias || null, inicio, fin, folio_imss || null]
  );
}

export function adjuntarComprobante(incapacidadId, url) {
  return one(`UPDATE incapacidades SET comprobante_url=$2 WHERE id=$1 RETURNING *`, [
    incapacidadId,
    url,
  ]);
}

export function incapacidadPendienteComprobante(empleadoId) {
  return one(
    `SELECT * FROM incapacidades
      WHERE empleado_id=$1 AND comprobante_url IS NULL
      ORDER BY creado_en DESC LIMIT 1`,
    [empleadoId]
  );
}

// ─── ESTATUS (última solicitud de cada tipo) ──────────────────────────────
export async function consultarEstatus(empleadoId) {
  const permiso = await one(
    `SELECT tipo, estatus, fecha_inicio FROM permisos WHERE empleado_id=$1 ORDER BY creado_en DESC LIMIT 1`,
    [empleadoId]
  );
  const vacacion = await one(
    `SELECT estatus, fecha_inicio, fecha_fin, dias FROM vacaciones WHERE empleado_id=$1 ORDER BY creado_en DESC LIMIT 1`,
    [empleadoId]
  );
  const incapacidad = await one(
    `SELECT estatus, tipo, fecha_inicio FROM incapacidades WHERE empleado_id=$1 ORDER BY creado_en DESC LIMIT 1`,
    [empleadoId]
  );
  return { permiso, vacacion, incapacidad };
}

// ─── APROBACIONES (admin) ─────────────────────────────────────────────────
const TABLAS = { permiso: 'permisos', vacacion: 'vacaciones', incapacidad: 'incapacidades' };

export async function resolver(tipoSolicitud, id, { estatus, adminId, observaciones }) {
  const tabla = TABLAS[tipoSolicitud];
  if (!tabla) throw new Error('Tipo de solicitud inválido');

  const extra = tabla === 'incapacidades' && observaciones ? ', observaciones=$4' : '';
  const params = [id, estatus, adminId];
  if (extra) params.push(observaciones);

  const solicitud = await one(
    `UPDATE ${tabla} SET estatus=$2, aprobado_por=$3, resuelto_en=now() ${extra}
      WHERE id=$1 RETURNING *`,
    params
  );

  // Al aprobar vacaciones, descuenta del saldo del empleado
  if (tabla === 'vacaciones' && estatus === 'aprobada' && solicitud) {
    await query(`UPDATE empleados SET dias_vacaciones_saldo = dias_vacaciones_saldo - $2 WHERE id=$1`, [
      solicitud.empleado_id,
      solicitud.dias,
    ]);
  }
  return solicitud;
}

// Subconsulta LATERAL: lista (JSON) de quién más está AUSENTE (vacaciones o
// permiso aprobado) en fechas que se empalman con las de esta solicitud.
const EMPALMES_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'nombre', x.nombre, 'tipo', x.tipo, 'inicio', x.fi, 'fin', x.ff)) AS lista
    FROM (
      SELECT e2.nombre, 'vacaciones' AS tipo, v.fecha_inicio AS fi, v.fecha_fin AS ff
        FROM vacaciones v JOIN empleados e2 ON e2.id=v.empleado_id
       WHERE v.estatus='aprobada' AND e2.empresa_id=$1 AND e2.id<>s.empleado_id
         AND v.fecha_inicio <= COALESCE(s.fecha_fin, s.fecha_inicio)
         AND COALESCE(v.fecha_fin, v.fecha_inicio) >= s.fecha_inicio
      UNION ALL
      SELECT e2.nombre, 'permiso' AS tipo, p.fecha_inicio, p.fecha_fin
        FROM permisos p JOIN empleados e2 ON e2.id=p.empleado_id
       WHERE p.estatus='aprobado' AND e2.empresa_id=$1 AND e2.id<>s.empleado_id
         AND p.fecha_inicio <= COALESCE(s.fecha_fin, s.fecha_inicio)
         AND COALESCE(p.fecha_fin, p.fecha_inicio) >= s.fecha_inicio
    ) x
  ) emp ON true`;

/** Solicitudes pendientes (para el panel y notificaciones al admin). */
export async function pendientes(empresaId = 1) {
  // cols: expresiones específicas de cada tabla (dias, horas, motivo, subtipo)
  const q = (tabla, tipo, cols) =>
    query(
      `SELECT s.id, '${tipo}' AS tipo_solicitud, e.nombre AS empleado, e.whatsapp,
              s.estatus, s.creado_en, s.fecha_inicio, s.fecha_fin,
              ${cols.dias} AS dias, ${cols.horas} AS horas,
              ${cols.motivo} AS motivo, ${cols.subtipo} AS subtipo,
              COALESCE(emp.lista, '[]'::json) AS empalmes
         FROM ${tabla} s JOIN empleados e ON e.id = s.empleado_id
         ${EMPALMES_LATERAL}
        WHERE s.estatus='pendiente' AND e.empresa_id=$1 ORDER BY s.creado_en`,
      [empresaId]
    );
  const [p, v, i] = await Promise.all([
    q('permisos', 'permiso', { dias: 'NULL', horas: 's.horas', motivo: 's.motivo', subtipo: 's.tipo' }),
    q('vacaciones', 'vacacion', { dias: 's.dias', horas: 'NULL', motivo: 'NULL', subtipo: 'NULL' }),
    q('incapacidades', 'incapacidad', { dias: 's.dias', horas: 'NULL', motivo: 's.folio_imss', subtipo: 's.tipo' }),
  ]);
  return [...p.rows, ...v.rows, ...i.rows];
}

/** Ausencias APROBADAS que se cruzan con un rango (para la pantalla de Ausencias). */
export async function ausencias(empresaId, desde, hasta) {
  const { rows } = await query(
    `SELECT * FROM (
        SELECT 'vacaciones' AS tipo, e.nombre AS empleado, e.whatsapp,
               v.fecha_inicio, v.fecha_fin, v.dias, v.estatus
          FROM vacaciones v JOIN empleados e ON e.id=v.empleado_id
         WHERE e.empresa_id=$1 AND v.estatus='aprobada'
        UNION ALL
        SELECT 'permiso' AS tipo, e.nombre, e.whatsapp,
               p.fecha_inicio, p.fecha_fin, p.horas AS dias, p.estatus
          FROM permisos p JOIN empleados e ON e.id=p.empleado_id
         WHERE e.empresa_id=$1 AND p.estatus='aprobado'
        UNION ALL
        SELECT 'incapacidad' AS tipo, e.nombre, e.whatsapp,
               i.fecha_inicio, i.fecha_fin, i.dias, i.estatus
          FROM incapacidades i JOIN empleados e ON e.id=i.empleado_id
         WHERE e.empresa_id=$1 AND i.estatus='aprobada'
     ) a
     WHERE a.fecha_inicio <= $3 AND COALESCE(a.fecha_fin, a.fecha_inicio) >= $2
     ORDER BY a.fecha_inicio`,
    [empresaId, desde, hasta]
  );
  return rows;
}
