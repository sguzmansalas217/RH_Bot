import { one } from '../../db/pool.js';

/**
 * Calcula ISR sobre una base gravable para un periodo dado (default semanal),
 * usando la tarifa configurada en sat_tarifas_isr (Art. 96 LISR).
 * Aplica subsidio para el empleo si hay tabla cargada.
 */
export async function calcularISR(baseGravable, periodo = 'semanal') {
  if (baseGravable <= 0) return 0;

  const renglon = await one(
    `SELECT * FROM sat_tarifas_isr
      WHERE periodo=$1 AND limite_inferior <= $2
        AND (limite_superior IS NULL OR limite_superior >= $2)
      ORDER BY limite_inferior DESC LIMIT 1`,
    [periodo, baseGravable]
  );
  if (!renglon) return 0;

  const excedente = baseGravable - Number(renglon.limite_inferior);
  const impuestoMarginal = excedente * (Number(renglon.porcentaje) / 100);
  let isr = Number(renglon.cuota_fija) + impuestoMarginal;

  // Subsidio para el empleo (si aplica)
  const subs = await one(
    `SELECT subsidio FROM sat_subsidio_empleo
      WHERE periodo=$1 AND limite_inferior <= $2
        AND (limite_superior IS NULL OR limite_superior >= $2)
      ORDER BY limite_inferior DESC LIMIT 1`,
    [periodo, baseGravable]
  );
  if (subs) isr -= Number(subs.subsidio);

  return Math.max(0, Math.round(isr * 100) / 100);
}
