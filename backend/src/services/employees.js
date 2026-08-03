import { one, query } from '../db/pool.js';

// Deja solo los últimos 10 dígitos (número nacional de México), ignorando
// prefijos de país, el "1" extra que agrega WhatsApp, espacios y guiones.
function nacional10(num) {
  return String(num || '').replace(/\D/g, '').slice(-10);
}

export function buscarPorWhatsapp(whatsapp) {
  // Compara por los últimos 10 dígitos en ambos lados → encuentra al empleado
  // sin importar cómo se haya guardado el número (con/sin 52, con/sin 1, con guiones).
  return one(
    `SELECT e.*, h.hora_entrada, h.hora_salida, h.dias_laborales, h.minutos_comida,
            o.nombre AS obra_nombre
       FROM empleados e
       LEFT JOIN horarios h ON h.id = e.horario_id
       LEFT JOIN obras o ON o.id = e.obra_id
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
