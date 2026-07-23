import { one, query } from '../db/pool.js';

export function buscarPorWhatsapp(whatsapp) {
  return one(
    `SELECT e.*, h.hora_entrada, h.hora_salida, h.dias_laborales, h.minutos_comida,
            o.nombre AS obra_nombre
       FROM empleados e
       LEFT JOIN horarios h ON h.id = e.horario_id
       LEFT JOIN obras o ON o.id = e.obra_id
      WHERE e.whatsapp = $1 AND e.activo = true`,
    [whatsapp]
  );
}

export function esAdmin(whatsapp, admins) {
  return admins.includes(whatsapp);
}

export async function adminPorWhatsapp(whatsapp) {
  return one(`SELECT * FROM usuarios_admin WHERE whatsapp = $1 AND activo = true`, [whatsapp]);
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
