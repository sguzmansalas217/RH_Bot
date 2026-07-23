import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';

/** Datos de asistencia para un rango de fechas. */
export async function datosAsistencia(empresaId, desde, hasta) {
  const { rows } = await query(
    `SELECT e.nombre AS empleado, a.fecha, a.entrada, a.salida,
            a.horas_trabajadas, a.horas_extra, a.minutos_retardo, a.estatus,
            o.nombre AS obra
       FROM asistencias a
       JOIN empleados e ON e.id = a.empleado_id
       LEFT JOIN obras o ON o.id = a.obra_id
      WHERE e.empresa_id=$1 AND a.fecha BETWEEN $2 AND $3
      ORDER BY a.fecha, e.nombre`,
    [empresaId, desde, hasta]
  );
  return rows;
}

/** Genera un Excel de asistencia y lo escribe en el stream de respuesta. */
export async function asistenciaExcel(res, empresaId, desde, hasta) {
  const rows = await datosAsistencia(empresaId, desde, hasta);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Asistencia');
  ws.columns = [
    { header: 'Empleado', key: 'empleado', width: 28 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Obra', key: 'obra', width: 20 },
    { header: 'Entrada', key: 'entrada', width: 20 },
    { header: 'Salida', key: 'salida', width: 20 },
    { header: 'Horas', key: 'horas_trabajadas', width: 10 },
    { header: 'H. Extra', key: 'horas_extra', width: 10 },
    { header: 'Retardo (min)', key: 'minutos_retardo', width: 14 },
    { header: 'Estatus', key: 'estatus', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="asistencia_${desde}_${hasta}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

/** Genera un recibo de nómina en PDF. */
export async function reciboPDF(res, reciboId) {
  const { rows: cab } = await query(
    `SELECT r.*, e.nombre AS empleado, e.numero_empleado, p.fecha_inicio, p.fecha_fin
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
  doc.text(`Días trabajados: ${r.dias_trabajados}   Horas extra: ${r.horas_extra}`).moveDown();

  doc.font('Helvetica-Bold').text('Percepciones');
  doc.font('Helvetica');
  detalle.filter((d) => d.naturaleza === 'percepcion').forEach((d) => {
    doc.text(`  ${d.concepto}`, { continued: true }).text(`$${Number(d.importe).toFixed(2)}`, { align: 'right' });
  });
  doc.moveDown(0.5).font('Helvetica-Bold').text('Deducciones');
  doc.font('Helvetica');
  detalle.filter((d) => d.naturaleza === 'deduccion').forEach((d) => {
    doc.text(`  ${d.concepto}`, { continued: true }).text(`$${Number(d.importe).toFixed(2)}`, { align: 'right' });
  });

  doc.moveDown();
  doc.font('Helvetica-Bold');
  doc.text(`Total percepciones: $${Number(r.total_percepciones).toFixed(2)}`);
  doc.text(`Total deducciones: $${Number(r.total_deducciones).toFixed(2)}`);
  doc.fontSize(13).text(`NETO A PAGAR: $${Number(r.neto_pagar).toFixed(2)}`, { align: 'right' });

  doc.end();
}

const fmt = (d) => new Date(d).toLocaleDateString('es-MX');
