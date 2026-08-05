import { query, tx } from '../db/pool.js';

// ─── Tarifa ISR (Art. 96 LISR) — nacional, compartida por todas las empresas ───

export async function listarTarifasISR(periodo = 'semanal') {
  const { rows } = await query(
    `SELECT id, periodo, limite_inferior, limite_superior, cuota_fija, porcentaje
       FROM sat_tarifas_isr WHERE periodo=$1 ORDER BY limite_inferior ASC`,
    [periodo]
  );
  return rows;
}

// Reemplaza por completo la tarifa de un periodo con los renglones recibidos.
export async function guardarTarifasISR(periodo, renglones) {
  if (!periodo) throw new Error('Falta el periodo');
  if (!Array.isArray(renglones) || renglones.length === 0)
    throw new Error('La tabla no puede quedar vacía');

  const limpias = renglones.map((r) => {
    const li = Number(r.limite_inferior);
    const ls =
      r.limite_superior === '' || r.limite_superior === null || r.limite_superior === undefined
        ? null
        : Number(r.limite_superior);
    const cuota = Number(r.cuota_fija);
    const pct = Number(r.porcentaje);
    if ([li, cuota, pct].some((n) => Number.isNaN(n)) || (ls !== null && Number.isNaN(ls)))
      throw new Error('Hay valores no numéricos en la tabla de ISR');
    return { li, ls, cuota, pct };
  });

  await tx(async (client) => {
    await client.query(`DELETE FROM sat_tarifas_isr WHERE periodo=$1`, [periodo]);
    for (const r of limpias) {
      await client.query(
        `INSERT INTO sat_tarifas_isr (periodo, limite_inferior, limite_superior, cuota_fija, porcentaje)
         VALUES ($1,$2,$3,$4,$5)`,
        [periodo, r.li, r.ls, r.cuota, r.pct]
      );
    }
  });
  return listarTarifasISR(periodo);
}

// ─── Parámetros IMSS (cuota obrera sobre el SBC) ───

export async function listarIMSS() {
  const { rows } = await query(
    `SELECT id, clave, descripcion, porcentaje_obrero FROM imss_parametros ORDER BY id ASC`
  );
  return rows;
}

export async function guardarIMSS(parametros) {
  if (!Array.isArray(parametros)) throw new Error('Datos inválidos');
  await tx(async (client) => {
    for (const p of parametros) {
      const pct = Number(p.porcentaje_obrero);
      if (!p.clave || Number.isNaN(pct)) throw new Error('Hay porcentajes no numéricos en IMSS');
      await client.query(`UPDATE imss_parametros SET porcentaje_obrero=$2 WHERE clave=$1`, [p.clave, pct]);
    }
  });
  return listarIMSS();
}
