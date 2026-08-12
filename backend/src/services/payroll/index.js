import { one, query, tx } from '../../db/pool.js';
import { calcularISR } from './isr.js';
import { calcularIMSS } from './imss.js';

export * as prestaciones from './prestaciones.js';

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

// Normaliza una fecha (objeto Date de pg o texto) a 'YYYY-MM-DD'.
function aISO(v) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

// Itera fechas YYYY-MM-DD entre inicio y fin inclusive
function* rangoFechas(inicio, fin) {
  const d = new Date(aISO(inicio) + 'T00:00:00Z');
  const end = new Date(aISO(fin) + 'T00:00:00Z');
  while (d <= end) {
    yield { iso: d.toISOString().slice(0, 10), dow: d.getUTCDay() };
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/**
 * Calcula la nómina de todos los empleados activos para un periodo.
 * Genera recibos_nomina + recibo_detalle. Idempotente por (periodo, empleado).
 */
export async function calcularNomina(periodoId) {
  const periodo = await one(`SELECT * FROM periodos_nomina WHERE id=$1`, [periodoId]);
  if (!periodo) throw new Error('Periodo no encontrado');

  const empresa = await one(`SELECT * FROM empresas WHERE id=$1`, [periodo.empresa_id]);
  const { rows: empleados } = await query(
    `SELECT e.*, h.dias_laborales, h.hora_entrada, h.hora_salida
       FROM empleados e LEFT JOIN horarios h ON h.id=e.horario_id
      WHERE e.empresa_id=$1 AND e.activo=true`,
    [periodo.empresa_id]
  );

  const resultados = [];
  for (const emp of empleados) {
    const recibo = await calcularRecibo(emp, empresa, periodo);
    resultados.push(recibo);
  }

  await query(`UPDATE periodos_nomina SET estatus='calculado' WHERE id=$1`, [periodoId]);
  return resultados;
}

async function calcularRecibo(emp, empresa, periodo) {
  const { fecha_inicio, fecha_fin } = periodo;
  const jornada = Number(empresa.horas_jornada || 8);
  const tarifaHora = Number(emp.salario_diario) / jornada;

  // ── Asistencias del periodo ──
  const { rows: asistencias } = await query(
    `SELECT * FROM asistencias WHERE empleado_id=$1 AND fecha BETWEEN $2 AND $3`,
    [emp.id, fecha_inicio, fecha_fin]
  );
  const porFecha = new Map(asistencias.map((a) => [aISO(a.fecha), a]));

  const diasLaborables = emp.dias_laborales || [1, 2, 3, 4, 5, 6];
  let diasTrabajados = 0;
  let faltas = 0;
  let totalHorasExtra = 0;
  let totalRetardosMin = 0;
  let domingosTrabajados = 0;
  let diasDescansoNoTrabajados = 0; // días de descanso (no laborables) que no se trabajaron

  for (const { iso, dow } of rangoFechas(fecha_inicio, fecha_fin)) {
    const a = porFecha.get(iso);
    const esLaborable = diasLaborables.includes(dow);
    if (a?.entrada && a?.salida) {
      diasTrabajados++;
      totalHorasExtra += Number(a.horas_extra || 0);
      totalRetardosMin += Number(a.minutos_retardo || 0);
      if (dow === 0) domingosTrabajados++;
    } else if (esLaborable) {
      faltas++;
    } else {
      diasDescansoNoTrabajados++;
    }
  }

  // ── PERCEPCIONES ──
  const detalle = [];
  const percep = (concepto, importe, cantidad = null, gravable = true) => {
    if (importe > 0) detalle.push({ concepto, naturaleza: 'percepcion', importe: round(importe), cantidad, gravable });
  };
  const deduc = (concepto, importe, cantidad = null) => {
    if (importe > 0) detalle.push({ concepto, naturaleza: 'deduccion', importe: round(importe), cantidad });
  };

  const sueldo = Number(emp.salario_diario) * diasTrabajados;
  percep('Sueldo', sueldo, diasTrabajados);

  // Día(s) de descanso pagado(s) — "séptimo día" (Art. 69-71 LFT).
  // Se pagan solo si el empleado cumplió su semana (sin faltas). Si trabajó el
  // día de descanso, ya se contó como día trabajado + prima dominical, no se duplica.
  const diasDescansoPagados = faltas === 0 ? diasDescansoNoTrabajados : 0;
  if (diasDescansoPagados > 0) {
    percep('Día de descanso', Number(emp.salario_diario) * diasDescansoPagados, diasDescansoPagados);
  }

  // Horas extra (dobles las primeras 9/sem, triples el excedente)
  const heDobles = Math.min(totalHorasExtra, 9);
  const heTriples = Math.max(0, totalHorasExtra - 9);
  const importeExtra =
    heDobles * tarifaHora * Number(empresa.factor_hora_extra_doble || 2) +
    heTriples * tarifaHora * Number(empresa.factor_hora_extra_triple || 3);
  percep('Horas extra', importeExtra, totalHorasExtra);

  // Prima dominical
  if (domingosTrabajados > 0) {
    const primaDom = Number(emp.salario_diario) * Number(empresa.prima_dominical_pct || 0.25) * domingosTrabajados;
    percep('Prima dominical', primaDom, domingosTrabajados);
  }

  // Conceptos recurrentes del empleado (bonos, comisiones, deducciones fijas)
  const { rows: conceptos } = await query(
    `SELECT ec.monto, ec.porcentaje, c.nombre, c.naturaleza, c.gravable, c.clave
       FROM empleado_conceptos ec JOIN conceptos_nomina c ON c.id=ec.concepto_id
      WHERE ec.empleado_id=$1 AND ec.activo=true`,
    [emp.id]
  );
  for (const c of conceptos) {
    let importe = Number(c.monto || 0);
    if (c.porcentaje) importe += sueldo * (Number(c.porcentaje) / 100);
    // Bono de puntualidad: solo si no hubo retardos
    if (c.clave === 'BONO_PUNT' && totalRetardosMin > 0) continue;
    // Bono de asistencia: solo si no hubo faltas
    if (c.clave === 'BONO_ASIST' && faltas > 0) continue;
    if (c.naturaleza === 'percepcion') percep(c.nombre, importe, null, c.gravable);
    else deduc(c.nombre, importe);
  }

  // ── DEDUCCIONES automáticas ──
  // Descuento por faltas
  if (faltas > 0) deduc('Descuento por falta', Number(emp.salario_diario) * faltas, faltas);
  // Descuento por retardos (proporcional a los minutos)
  if (totalRetardosMin > 0) deduc('Descuento por retardo', (tarifaHora / 60) * totalRetardosMin, totalRetardosMin);

  // Base gravable para ISR = percepciones gravables
  const baseGravable = detalle
    .filter((d) => d.naturaleza === 'percepcion' && d.gravable !== false)
    .reduce((s, d) => s + d.importe, 0);

  // ISR: desde la tarifa del SAT (modo 'tabla') o monto fijo por empleado (modo 'manual').
  // El monto manual solo se aplica si hubo percepciones gravables (no cobra ISR a quien no trabajó).
  const isr = empresa.isr_modo === 'manual'
    ? (baseGravable > 0 ? round(Number(emp.isr_manual || 0)) : 0)
    : await calcularISR(baseGravable, periodo.tipo === 'quincenal' ? 'mensual' : 'semanal');
  // Guarda el % efectivo de ISR (impuesto / base gravable) para mostrarlo en el recibo.
  deduc('ISR', isr, baseGravable > 0 ? round((isr / baseGravable) * 100) : null);

  const diasPeriodo = diasTrabajados || 7;
  const imss = await calcularIMSS(emp.salario_diario_integrado || emp.salario_diario, diasPeriodo);
  deduc('IMSS', imss, diasPeriodo); // días cotizados

  // Préstamos y FONACOT (amortización semanal)
  const { rows: prestamos } = await query(
    `SELECT * FROM prestamos WHERE empleado_id=$1 AND activo=true AND saldo>0`,
    [emp.id]
  );
  for (const p of prestamos) {
    const desc = Math.min(Number(p.descuento_semanal), Number(p.saldo));
    deduc(p.tipo === 'fonacot' ? 'FONACOT' : 'Préstamo', desc);
  }

  // ── Totales ──
  const totalPercep = detalle.filter((d) => d.naturaleza === 'percepcion').reduce((s, d) => s + d.importe, 0);
  const totalDeduc = detalle.filter((d) => d.naturaleza === 'deduccion').reduce((s, d) => s + d.importe, 0);
  const neto = round(totalPercep - totalDeduc);

  // ── Persistencia (transacción) ──
  return tx(async (client) => {
    const recibo = (
      await client.query(
        `INSERT INTO recibos_nomina
           (periodo_id, empleado_id, dias_trabajados, horas_normales, horas_extra,
            total_percepciones, total_deducciones, neto_pagar)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (periodo_id, empleado_id) DO UPDATE SET
            dias_trabajados=EXCLUDED.dias_trabajados, horas_normales=EXCLUDED.horas_normales,
            horas_extra=EXCLUDED.horas_extra, total_percepciones=EXCLUDED.total_percepciones,
            total_deducciones=EXCLUDED.total_deducciones, neto_pagar=EXCLUDED.neto_pagar
         RETURNING id`,
        [periodo.id, emp.id, diasTrabajados, diasTrabajados * jornada, totalHorasExtra,
          round(totalPercep), round(totalDeduc), neto]
      )
    ).rows[0];

    await client.query(`DELETE FROM recibo_detalle WHERE recibo_id=$1`, [recibo.id]);
    for (const d of detalle) {
      await client.query(
        `INSERT INTO recibo_detalle (recibo_id, concepto, naturaleza, cantidad, importe)
         VALUES ($1,$2,$3,$4,$5)`,
        [recibo.id, d.concepto, d.naturaleza, d.cantidad, d.importe]
      );
    }

    // Amortiza préstamos
    for (const p of prestamos) {
      const desc = Math.min(Number(p.descuento_semanal), Number(p.saldo));
      await client.query(
        `UPDATE prestamos SET saldo=saldo-$2, activo=(saldo-$2>0) WHERE id=$1`,
        [p.id, desc]
      );
    }

    return {
      empleado: emp.nombre,
      dias_trabajados: diasTrabajados,
      faltas,
      horas_extra: totalHorasExtra,
      total_percepciones: round(totalPercep),
      total_deducciones: round(totalDeduc),
      neto_pagar: neto,
      detalle,
    };
  });
}

/** Estimación rápida de nómina de la semana en curso (para consulta por WhatsApp). */
export async function estimarSemana(emp, empresa) {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const inicio = lunes.toISOString().slice(0, 10);
  const fin = hoy.toISOString().slice(0, 10);

  const r = await one(
    `SELECT COALESCE(SUM(CASE WHEN entrada IS NOT NULL AND salida IS NOT NULL THEN 1 ELSE 0 END),0) AS dias,
            COALESCE(SUM(horas_extra),0) AS extra
       FROM asistencias WHERE empleado_id=$1 AND fecha BETWEEN $2 AND $3`,
    [emp.id, inicio, fin]
  );
  const jornada = Number(empresa?.horas_jornada || 8);
  const tarifaHora = Number(emp.salario_diario) / jornada;
  const sueldo = Number(emp.salario_diario) * Number(r.dias);
  const extra = Number(r.extra) * tarifaHora * 2;
  const bruto = sueldo + extra;
  const isr = empresa?.isr_modo === 'manual'
    ? (bruto > 0 ? round(Number(emp.isr_manual || 0)) : 0)
    : await calcularISR(bruto, 'semanal');
  return {
    dias: Number(r.dias),
    horas_extra: Number(r.extra),
    bruto: round(bruto),
    isr,
    estimado_neto: round(bruto - isr),
  };
}
