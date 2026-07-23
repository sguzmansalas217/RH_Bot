import { one, query } from '../db/pool.js';

/** Estado conversacional por número (flujos multi-paso). */
export async function getEstado(whatsapp) {
  return one(`SELECT * FROM conversacion_estado WHERE whatsapp = $1`, [whatsapp]);
}

export async function setEstado(whatsapp, esperando, contexto = null) {
  await query(
    `INSERT INTO conversacion_estado (whatsapp, esperando, contexto, actualizado_en)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (whatsapp) DO UPDATE
       SET esperando = EXCLUDED.esperando,
           contexto = EXCLUDED.contexto,
           actualizado_en = now()`,
    [whatsapp, esperando, contexto ? JSON.stringify(contexto) : null]
  );
}

export async function limpiarEstado(whatsapp) {
  await query(`DELETE FROM conversacion_estado WHERE whatsapp = $1`, [whatsapp]);
}
