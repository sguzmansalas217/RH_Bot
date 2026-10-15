import { one, query } from '../db/pool.js';
import { config } from '../config/index.js';

const ESTATUS = ['nuevo', 'contactado', 'demo', 'cliente', 'descartado'];

// Misma llave que el estado conversacional: últimos 10 dígitos (número nacional MX).
export function clave(whatsapp) {
  const s = String(whatsapp || '');
  if (s.includes('@')) return s; // JID sin número visible (p.ej. @lid)
  return s.replace(/\D/g, '').slice(-10);
}

/** Crea o actualiza el prospecto de ese número con los campos dados (solo los no vacíos). */
export async function guardarProspecto(whatsapp, campos = {}) {
  const { nombre = null, empresa = null, empleados = null, interes = null, primer_mensaje = null } = campos;
  return one(
    `INSERT INTO prospectos (whatsapp, wa_raw, nombre, empresa, empleados, interes, primer_mensaje)
     VALUES ($1,$7,$2,$3,$4,$5,$6)
     ON CONFLICT (whatsapp) DO UPDATE SET
       wa_raw         = EXCLUDED.wa_raw,
       nombre         = COALESCE(EXCLUDED.nombre, prospectos.nombre),
       empresa        = COALESCE(EXCLUDED.empresa, prospectos.empresa),
       empleados      = COALESCE(EXCLUDED.empleados, prospectos.empleados),
       interes        = COALESCE(EXCLUDED.interes, prospectos.interes),
       primer_mensaje = COALESCE(prospectos.primer_mensaje, EXCLUDED.primer_mensaje),
       actualizado_en = now()
     RETURNING *`,
    [clave(whatsapp), nombre, empresa, empleados, interes, primer_mensaje, String(whatsapp)]
  );
}

export function obtenerProspecto(whatsapp) {
  return one(`SELECT * FROM prospectos WHERE whatsapp = $1`, [clave(whatsapp)]);
}

export async function listarProspectos() {
  const { rows } = await query(`SELECT * FROM prospectos ORDER BY creado_en DESC`);
  return rows;
}

export async function actualizarProspecto(id, { estatus, notas }) {
  if (estatus && !ESTATUS.includes(estatus)) throw new Error('Estatus inválido');
  const row = await one(
    `UPDATE prospectos SET
       estatus = COALESCE($2, estatus),
       notas = COALESCE($3, notas),
       actualizado_en = now()
     WHERE id = $1 RETURNING *`,
    [id, estatus || null, notas ?? null]
  );
  if (!row) throw new Error('Prospecto no encontrado');
  return row;
}

/** Marca como 'contactado' un prospecto 'nuevo' (cuando el dueño le responde). */
export async function marcarContactado(whatsapp) {
  await query(
    `UPDATE prospectos SET estatus='contactado', actualizado_en=now()
      WHERE whatsapp=$1 AND estatus='nuevo'`,
    [clave(whatsapp)]
  );
}

/**
 * Números del dueño del sistema: ADMIN_WHATSAPP del .env + súper-admins con WhatsApp.
 * Reciben el aviso de cada prospecto nuevo y pueden contestarles desde el bot.
 */
export async function numerosDueno() {
  const { rows } = await query(
    `SELECT whatsapp FROM usuarios_admin
      WHERE rol='superadmin' AND activo=true AND whatsapp IS NOT NULL AND whatsapp <> ''`
  );
  const todos = [...config.whatsapp.admins, ...rows.map((r) => r.whatsapp)];
  const vistos = new Set();
  return todos.filter((n) => {
    const k = clave(n);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export async function esDueno(whatsapp) {
  const k = clave(whatsapp);
  return (await numerosDueno()).some((n) => clave(n) === k);
}
