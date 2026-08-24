-- Desglose de la nómina de la semana 2026-08-16 → 2026-08-22.
-- Solo lectura. Muestra cada línea (percepción/deducción) de cada recibo,
-- para entender de dónde salen los netos negativos.
\set ini '2026-08-16'
\set fin '2026-08-22'

-- 1) Resumen por empleado (días, faltas via asistencias, totales del recibo)
SELECT e.nombre,
       r.dias_trabajados        AS dias,
       r.horas_extra            AS h_extra,
       r.total_percepciones     AS percepciones,
       r.total_deducciones      AS deducciones,
       r.neto_pagar             AS neto,
       e.salario_diario,
       e.activo
FROM recibos_nomina r
JOIN periodos_nomina p ON p.id = r.periodo_id
JOIN empleados e       ON e.id = r.empleado_id
WHERE p.fecha_inicio = :'ini' AND p.fecha_fin = :'fin'
ORDER BY r.neto_pagar ASC;   -- los más negativos primero

-- 2) Cada línea del recibo (el detalle real que se ve en el PDF)
SELECT e.nombre,
       d.naturaleza,
       d.concepto,
       d.cantidad,
       d.importe
FROM recibo_detalle d
JOIN recibos_nomina r  ON r.id = d.recibo_id
JOIN periodos_nomina p ON p.id = r.periodo_id
JOIN empleados e       ON e.id = r.empleado_id
WHERE p.fecha_inicio = :'ini' AND p.fecha_fin = :'fin'
  AND r.neto_pagar < 0            -- solo los que salieron negativos
ORDER BY e.nombre, d.naturaleza DESC, d.importe DESC;

-- 3) Conceptos fijos (bonos/deducciones) y préstamos asignados a los negativos
SELECT e.nombre, 'concepto' AS tipo, c.nombre AS detalle, c.naturaleza,
       ec.monto, ec.porcentaje, ec.activo
FROM empleado_conceptos ec
JOIN conceptos_nomina c ON c.id = ec.concepto_id
JOIN empleados e        ON e.id = ec.empleado_id
JOIN recibos_nomina r   ON r.empleado_id = e.id
JOIN periodos_nomina p  ON p.id = r.periodo_id
WHERE p.fecha_inicio = :'ini' AND p.fecha_fin = :'fin' AND r.neto_pagar < 0
UNION ALL
SELECT e.nombre, 'prestamo' AS tipo, pr.tipo AS detalle, 'deduccion',
       pr.descuento_semanal, NULL, pr.activo
FROM prestamos pr
JOIN empleados e       ON e.id = pr.empleado_id
JOIN recibos_nomina r  ON r.empleado_id = e.id
JOIN periodos_nomina p ON p.id = r.periodo_id
WHERE p.fecha_inicio = :'ini' AND p.fecha_fin = :'fin' AND r.neto_pagar < 0 AND pr.saldo > 0
ORDER BY nombre;
