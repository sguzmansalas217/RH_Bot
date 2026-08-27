import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';

/** Datos de asistencia para un rango de fechas. */
export async function datosAsistencia(empresaId, desde, hasta) {
  const { rows } = await query(
    `SELECT e.nombre AS empleado, a.fecha, a.entrada, a.salida,
            a.horas_trabajadas, a.horas_extra, a.minutos_retardo,
            a.salida_anticipada_min, a.estatus, o.nombre AS obra,
            CASE WHEN a.salida IS NOT NULL THEN COALESCE(h.minutos_comida, 60) ELSE NULL END AS minutos_comida
       FROM asistencias a
       JOIN empleados e ON e.id = a.empleado_id
       LEFT JOIN horarios h ON h.id = e.horario_id
       LEFT JOIN obras o ON o.id = a.obra_id
      WHERE e.empresa_id=$1 AND a.fecha BETWEEN $2 AND $3
      ORDER BY a.fecha, e.nombre`,
    [empresaId, desde, hasta]
  );
  return rows;
}

/** Totales de la semana por trabajador (para la hoja de resumen). */
function resumenPorTrabajador(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.empleado)) {
      map.set(r.empleado, {
        empleado: r.empleado, dias: 0, horas_trabajadas: 0, horas_extra: 0,
        minutos_retardo: 0, minutos_comida: 0, salida_anticipada_min: 0,
      });
    }
    const t = map.get(r.empleado);
    if (r.entrada && r.salida) t.dias++;
    t.horas_trabajadas += Number(r.horas_trabajadas || 0);
    t.horas_extra += Number(r.horas_extra || 0);
    t.minutos_retardo += Number(r.minutos_retardo || 0);
    t.minutos_comida += Number(r.minutos_comida || 0);
    t.salida_anticipada_min += Number(r.salida_anticipada_min || 0);
  }
  // Redondea las horas a 2 decimales
  return [...map.values()].map((t) => ({
    ...t,
    horas_trabajadas: Math.round(t.horas_trabajadas * 100) / 100,
    horas_extra: Math.round(t.horas_extra * 100) / 100,
  }));
}

/** Genera un Excel de asistencia y lo escribe en el stream de respuesta. */
export async function asistenciaExcel(res, empresaId, desde, hasta) {
  const rows = await datosAsistencia(empresaId, desde, hasta);
  const wb = new ExcelJS.Workbook();

  // ── Hoja 1: Detalle día por día ──
  const ws = wb.addWorksheet('Detalle');
  ws.columns = [
    { header: 'Empleado', key: 'empleado', width: 28 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Obra', key: 'obra', width: 20 },
    { header: 'Entrada', key: 'entrada', width: 20 },
    { header: 'Salida', key: 'salida', width: 20 },
    { header: 'Horas', key: 'horas_trabajadas', width: 10 },
    { header: 'Comida (min)', key: 'minutos_comida', width: 12 },
    { header: 'H. Extra', key: 'horas_extra', width: 10 },
    { header: 'Retardo (min)', key: 'minutos_retardo', width: 14 },
    { header: 'S. anticipada (min)', key: 'salida_anticipada_min', width: 18 },
    { header: 'Estatus', key: 'estatus', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));

  // ── Hoja 2: Total de la semana por trabajador ──
  const ws2 = wb.addWorksheet('Totales por trabajador');
  ws2.columns = [
    { header: 'Empleado', key: 'empleado', width: 28 },
    { header: 'Días trabajados', key: 'dias', width: 15 },
    { header: 'Total horas', key: 'horas_trabajadas', width: 12 },
    { header: 'Total comida (min)', key: 'minutos_comida', width: 18 },
    { header: 'Total H. Extra', key: 'horas_extra', width: 14 },
    { header: 'Total retardo (min)', key: 'minutos_retardo', width: 18 },
    { header: 'Total S. anticipada (min)', key: 'salida_anticipada_min', width: 22 },
  ];
  ws2.getRow(1).font = { bold: true };
  resumenPorTrabajador(rows).forEach((t) => ws2.addRow(t));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="asistencia_${desde}_${hasta}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

/** Genera un recibo de nómina en PDF. */
export async function reciboPDF(res, reciboId) {
  const { rows: cab } = await query(
    `SELECT r.*, e.nombre AS empleado, e.numero_empleado,
            e.salario_diario, e.dias_vacaciones_saldo,
            p.fecha_inicio, p.fecha_fin
       FROM recibos_nomina r
       JOIN empleados e ON e.id = r.empleado_id
       JOIN periodos_nomina p ON p.id = r.periodo_id
      WHERE r.id=$1`,
    [reciboId]
  );
  if (!cab.length) return res.status(404).json({ error: 'Recibo no encontrado' });
  const r = cab[0];
  const { rows: detalle } = await query(
    `SELECT concepto, naturaleza, cantidad, importe FROM recibo_detalle WHERE recibo_id=$1 ORDER BY naturaleza DESC`,
    [reciboId]
  );

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="recibo_${reciboId}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text('Recibo de Nómina', { align: 'center' }).moveDown();
  doc.fontSize(10);
  doc.text(`Empleado: ${r.empleado}`);
  doc.text(`Periodo: ${fmt(r.fecha_inicio)} al ${fmt(r.fecha_fin)}`);
  doc.text(`Sueldo diario: $${Number(r.salario_diario).toFixed(2)}`);
  doc.text(`Días trabajados: ${r.dias_trabajados}   Horas extra: ${r.horas_extra}`);
  doc.text(`Días de vacaciones disponibles: ${Number(r.dias_vacaciones_saldo)}`).moveDown();

  doc.font('Helvetica-Bold').text('Percepciones');
  doc.font('Helvetica');
  detalle.filter((d) => d.naturaleza === 'percepcion').forEach((d) => {
    doc.text(detalleTexto(d), { continued: true }).text(`$${Number(d.importe).toFixed(2)}`, { align: 'right' });
  });
  doc.moveDown(0.5).font('Helvetica-Bold').text('Deducciones');
  doc.font('Helvetica');
  detalle.filter((d) => d.naturaleza === 'deduccion').forEach((d) => {
    doc.text(detalleTexto(d), { continued: true }).text(`$${Number(d.importe).toFixed(2)}`, { align: 'right' });
  });

  doc.moveDown();
  doc.font('Helvetica-Bold');
  doc.text(`Total percepciones: $${Number(r.total_percepciones).toFixed(2)}`);
  doc.text(`Total deducciones: $${Number(r.total_deducciones).toFixed(2)}`);
  doc.fontSize(13).text(`NETO A PAGAR: $${Number(r.neto_pagar).toFixed(2)}`, { align: 'right' });

  doc.end();
}

const fmt = (d) => new Date(d).toLocaleDateString('es-MX');

// Arma la etiqueta de un renglón del recibo con su cantidad/unidad según el concepto.
function detalleTexto(d) {
  const c = d.concepto;
  if (d.cantidad == null) return `  ${c}`;
  const n = Number(d.cantidad);
  if (c === 'ISR') return `  ${c} (${n.toFixed(2)}%)`;
  if (c === 'Horas extra') return `  ${c} (${n} h)`;
  if (c === 'Descuento por retardo') return `  ${c} (${n} min)`;
  if (c === 'Prima dominical') return `  ${c} (${n} ${n === 1 ? 'domingo' : 'domingos'})`;
  return `  ${c} (${n} ${n === 1 ? 'día' : 'días'})`;
}
