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
    `SELECT estatus, fecha_inicio, fecha_fin FROM vacaciones WHERE empleado_id=$1 ORDER BY creado_en DESC LIMIT 1`,
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

/** Solicitudes pendientes (para el panel y notificaciones al admin). */
export async function pendientes(empresaId = 1) {
  const q = (tabla, tipo) =>
    query(
      `SELECT s.id, '${tipo}' AS tipo_solicitud, e.nombre AS empleado, e.whatsapp, s.estatus, s.creado_en
         FROM ${tabla} s JOIN empleados e ON e.id = s.empleado_id
        WHERE s.estatus='pendiente' AND e.empresa_id=$1 ORDER BY s.creado_en`,
      [empresaId]
    );
  const [p, v, i] = await Promise.all([
    q('permisos', 'permiso'),
    q('vacaciones', 'vacacion'),
    q('incapacidades', 'incapacidad'),
  ]);
  return [...p.rows, ...v.rows, ...i.rows];
}
