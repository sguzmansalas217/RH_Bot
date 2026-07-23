import { query } from '../../db/pool.js';

/**
 * Cuota obrera IMSS sobre el Salario Base de Cotización (SDI) por los días del
 * periodo. Suma los porcentajes obrero configurados en imss_parametros.
 *
 * Nota: el cálculo completo con UMA y excedente de 3 UMA para
 * enfermedad/maternidad debe afinarse con los parámetros vigentes; aquí se
 * aplica el porcentaje configurado sobre el SDI del periodo.
 */
export async function calcularIMSS(sdi, diasPeriodo) {
  if (!sdi || sdi <= 0) return 0;
  const { rows } = await query(`SELECT SUM(porcentaje_obrero) AS total FROM imss_parametros`);
  const pctTotal = Number(rows[0]?.total || 0) / 100;
  const sbcPeriodo = Number(sdi) * diasPeriodo;
  return Math.round(sbcPeriodo * pctTotal * 100) / 100;
}
