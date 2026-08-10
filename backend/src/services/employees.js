import { one, query, tx } from '../db/pool.js';

// Borra por completo a un empleado y todo lo ligado a él (asistencias, permisos,
// vacaciones, incapacidades, incidencias, préstamos, conceptos, obras, recibos y
// mensajes). Así el número de WhatsApp queda libre para volver a registrarlo.
// La mayoría de tablas caen en cascada; solo mensajes_wa y conversacion_estado
// se limpian a mano (no tienen ON DELETE CASCADE).
export async function eliminarEmpleado(empleadoId, empresaId) {
  const id = Number(empleadoId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Empleado inválido');
  return tx(async (client) => {
    const { rows } = await client.query(
      `SELECT whatsapp FROM empleados WHERE id=$1 AND empresa_id=$2`,
      [id, empresaId]
    );
    if (!rows.length) throw new Error('El empleado no existe');
    const whatsapp = rows[0].whatsapp;
    await client.query(`DELETE FROM mensajes_wa WHERE empleado_id=$1 OR whatsapp=$2`, [id, whatsapp]);
    await client.query(`DELETE FROM conversacion_estado WHERE whatsapp=$1`, [whatsapp]);
    await client.query(`DELETE FROM empleados WHERE id=$1 AND empresa_id=$2`, [id, empresaId]);
    return { id };
  });
}

// Deja solo los últimos 10 dígitos (número nacional de México), ignorando
// prefijos de país, el "1" extra que agrega WhatsApp, espacios y guiones.
function nacional10(num) {
  return String(num || '').replace(/\D/g, '').slice(-10);
}

export function buscarPorWhatsapp(whatsapp) {
  // Compara por los últimos 10 dígitos en ambos lados → encuentra al empleado
  // sin importar cómo se haya guardado el número (con/sin 52, con/sin 1, con guiones).
  return one(
    `SELECT e.*, h.hora_entrada, h.hora_salida, h.dias_laborales, h.minutos_comida, h.dias_horario,
            o.nombre AS obra_nombre, em.nombre AS empresa_nombre,
            em.mostrar_sueldo_empleado
       FROM empleados e
       LEFT JOIN horarios h ON h.id = e.horario_id
       LEFT JOIN obras o ON o.id = e.obra_id
       LEFT JOIN empresas em ON em.id = e.empresa_id
      WHERE right(regexp_replace(e.whatsapp, '\\D', '', 'g'), 10) = $1 AND e.activo = true`,
    [nacional10(whatsapp)]
  );
}

export function esAdmin(whatsapp, admins) {
  return admins.includes(whatsapp);
}

export async function adminPorWhatsapp(whatsapp) {
  // Compara por los últimos 10 dígitos (tolera 52/521, "1" extra, guiones).
  return one(
    `SELECT * FROM usuarios_admin
      WHERE whatsapp IS NOT NULL AND whatsapp <> ''
        AND right(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $1
        AND activo = true
      LIMIT 1`,
    [nacional10(whatsapp)]
  );
}

export async function listar(empresaId = 1) {
  const { rows } = await query(
    `SELECT e.*, p.nombre AS puesto, d.nombre AS departamento
       FROM empleados e
       LEFT JOIN puestos p ON p.id = e.puesto_id
       LEFT JOIN departamentos d ON d.id = e.departamento_id
      WHERE e.empresa_id = $1 ORDER BY e.nombre`,
    [empresaId]
  );
  return rows;
}
