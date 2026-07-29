import { one, query } from '../db/pool.js';

// México: WhatsApp entrega el número como 521XXXXXXXXXX (con el "1"), pero a veces
// se registra como 52XXXXXXXXXX (sin el "1"). Genera ambas variantes para que la
// búsqueda encuentre al empleado sin importar cómo se haya guardado.
export function variantesNumero(num) {
  const n = String(num || '').replace(/\D/g, '');
  const set = new Set([n]);
  if (n.startsWith('521') && n.length === 13) set.add('52' + n.slice(3)); // quita el 1
  if (n.startsWith('52') && !n.startsWith('521') && n.length === 12) set.add('521' + n.slice(2)); // agrega el 1
  return [...set];
}

export function buscarPorWhatsapp(whatsapp) {
  return one(
    `SELECT e.*, h.hora_entrada, h.hora_salida, h.dias_laborales, h.minutos_comida,
            o.nombre AS obra_nombre
       FROM empleados e
       LEFT JOIN horarios h ON h.id = e.horario_id
       LEFT JOIN obras o ON o.id = e.obra_id
      WHERE e.whatsapp = ANY($1) AND e.activo = true`,
    [variantesNumero(whatsapp)]
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
