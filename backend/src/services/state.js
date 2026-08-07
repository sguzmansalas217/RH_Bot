import { one, query } from '../db/pool.js';

// Normaliza el número a sus últimos 10 dígitos (número nacional MX), para que
// la llave del estado sea la misma sin importar el formato con que llegue o se
// haya guardado (con/sin 52, con/sin el "1" extra de WhatsApp, con guiones).
// Así coincide el estado que se GUARDA (con empleado.whatsapp) con el que se
// LEE (con el número entrante), igual que hace buscarPorWhatsapp.
function clave(whatsapp) {
  return String(whatsapp || '').replace(/\D/g, '').slice(-10);
}

/** Estado conversacional por número (flujos multi-paso). */
export async function getEstado(whatsapp) {
  return one(`SELECT * FROM conversacion_estado WHERE whatsapp = $1`, [clave(whatsapp)]);
}

export async function setEstado(whatsapp, esperando, contexto = null) {
  await query(
    `INSERT INTO conversacion_estado (whatsapp, esperando, contexto, actualizado_en)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (whatsapp) DO UPDATE
       SET esperando = EXCLUDED.esperando,
           contexto = EXCLUDED.contexto,
           actualizado_en = now()`,
    [clave(whatsapp), esperando, contexto ? JSON.stringify(contexto) : null]
  );
}

export async function limpiarEstado(whatsapp) {
  await query(`DELETE FROM conversacion_estado WHERE whatsapp = $1`, [clave(whatsapp)]);
}
