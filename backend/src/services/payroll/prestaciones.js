import { one } from '../../db/pool.js';

/**
 * Cálculo de prestaciones conforme a la Ley Federal del Trabajo (valores base
 * configurables por empresa). Todas devuelven importes en MXN.
 */

const empresaCfg = (id) => one(`SELECT * FROM empresas WHERE id=$1`, [id]);

// Años de antigüedad (con decimales) entre ingreso y una fecha de corte
function antiguedadAnios(fechaIngreso, corte = new Date()) {
  const ing = new Date(fechaIngreso);
  return (corte - ing) / (365.25 * 86_400_000);
}

// Días de vacaciones por ley según antigüedad (reforma 2023)
export function diasVacacionesPorAntiguedad(anios) {
  const a = Math.floor(anios);
  if (a < 1) return 0;
  if (a === 1) return 12;
  if (a <= 5) return 12 + (a - 1) * 2; // 14,16,18,20
  // +2 días por cada 5 años adicionales
  return 20 + Math.floor((a - 5) / 5) * 2;
}

/** Aguinaldo (proporcional a los días trabajados en el año). */
export async function aguinaldo(empleado, { anio, diasTrabajados } = {}) {
  const cfg = await empresaCfg(empleado.empresa_id);
  const dias = cfg?.dias_aguinaldo ?? 15;
  const proporcion = diasTrabajados ? Math.min(1, diasTrabajados / 365) : 1;
  const importe = Number(empleado.salario_diario) * dias * proporcion;
  return { dias, proporcion, importe: round(importe) };
}

/** Prima vacacional. */
export async function primaVacacional(empleado) {
  const cfg = await empresaCfg(empleado.empresa_id);
  const anios = antiguedadAnios(empleado.fecha_ingreso);
  const diasVac = diasVacacionesPorAntiguedad(anios);
  const pct = Number(cfg?.prima_vacacional_pct ?? 0.25);
  const importe = Number(empleado.salario_diario) * diasVac * pct;
  return { diasVac, pct, importe: round(importe) };
}

/** Prima dominical por domingos trabajados. */
export async function primaDominical(empleado, domingosTrabajados = 0) {
  const cfg = await empresaCfg(empleado.empresa_id);
  const pct = Number(cfg?.prima_dominical_pct ?? 0.25);
  const importe = Number(empleado.salario_diario) * pct * domingosTrabajados;
  return { pct, domingosTrabajados, importe: round(importe) };
}

/** Prima de antigüedad: 12 días por año trabajado (LFT Art. 162). */
export async function primaAntiguedad(empleado, salarioTope = null) {
  const anios = antiguedadAnios(empleado.fecha_ingreso);
  const salario = salarioTope || Number(empleado.salario_diario);
  const importe = 12 * salario * anios;
  return { anios: round(anios), importe: round(importe) };
}

/**
 * Finiquito (renuncia/terminación sin responsabilidad patronal):
 * partes proporcionales de aguinaldo, vacaciones y prima vacacional
 * + días pendientes de pago.
 */
export async function finiquito(empleado, { diasPendientes = 0, diasTrabajadosAnio = 0 } = {}) {
  const ag = await aguinaldo(empleado, { diasTrabajados: diasTrabajadosAnio });
  const pv = await primaVacacional(empleado);
  const anios = antiguedadAnios(empleado.fecha_ingreso);
  const diasVac = diasVacacionesPorAntiguedad(anios);
  const proporcionAnio = Math.min(1, diasTrabajadosAnio / 365);
  const vacProporcional = Number(empleado.salario_diario) * diasVac * proporcionAnio;
  const salarioPendiente = Number(empleado.salario_diario) * diasPendientes;

  const total = ag.importe + pv.importe * proporcionAnio + vacProporcional + salarioPendiente;
  return {
    aguinaldo_prop: ag.importe,
    prima_vacacional_prop: round(pv.importe * proporcionAnio),
    vacaciones_prop: round(vacProporcional),
    salario_pendiente: round(salarioPendiente),
    total: round(total),
  };
}

/**
 * Liquidación (despido injustificado): finiquito + 3 meses de salario
 * + 20 días por año + prima de antigüedad.
 */
export async function liquidacion(empleado, opts = {}) {
  const fin = await finiquito(empleado, opts);
  const anios = antiguedadAnios(empleado.fecha_ingreso);
  const sd = Number(empleado.salario_diario);
  const tresMeses = sd * 90;
  const veinteDiasPorAnio = sd * 20 * anios;
  const primaAnt = await primaAntiguedad(empleado);

  const total =
    fin.total + tresMeses + veinteDiasPorAnio + primaAnt.importe;
  return {
    finiquito: fin.total,
    tres_meses: round(tresMeses),
    veinte_dias_por_anio: round(veinteDiasPorAnio),
    prima_antiguedad: primaAnt.importe,
    total: round(total),
  };
}

/** PTU: reparto individual = 50% por días + 50% por salario (requiere monto a repartir). */
export function ptuIndividual({ montoRepartible, diasEmpleado, totalDias, salarioEmpleado, totalSalarios }) {
  const porDias = (montoRepartible / 2) * (diasEmpleado / totalDias);
  const porSalario = (montoRepartible / 2) * (salarioEmpleado / totalSalarios);
  return round(porDias + porSalario);
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}
