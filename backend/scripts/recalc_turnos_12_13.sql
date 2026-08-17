-- Recalcula retardo, horas extra y salida anticipada de los empleados de
-- Turno2_9-6 (id 12) y Turno3_9-7 (id 13) contra su horario actual por día
-- y la tolerancia vigente de la empresa. Reconstruye sus incidencias.
-- Seguro y repetible (idempotente). No toca a nadie de otros horarios.

BEGIN;

WITH calc AS (
  SELECT
    a.id,
    GREATEST(0, v.ent_local - (p.ent_prog + v.tol)) AS new_retardo,
    CASE WHEN a.salida IS NULL THEN a.horas_extra
         ELSE GREATEST(0, ROUND((v.horas_trab - GREATEST(0, p.sal_prog - p.ent_prog - v.comida)/60.0)::numeric, 2))
    END AS new_extra,
    CASE WHEN a.salida IS NULL THEN a.salida_anticipada_min
         ELSE GREATEST(0, p.sal_prog - v.sal_local)
    END AS new_antic
  FROM asistencias a
  JOIN empleados emp ON emp.id = a.empleado_id
  JOIN horarios  h   ON h.id  = emp.horario_id
  JOIN empresas  e   ON e.id  = emp.empresa_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(h.minutos_comida,60)         AS comida,
      COALESCE(e.tolerancia_retardo_min,10) AS tol,
      (h.dias_horario -> ((EXTRACT(DOW FROM a.fecha))::int::text) ->> 'entrada') AS ent_txt,
      (h.dias_horario -> ((EXTRACT(DOW FROM a.fecha))::int::text) ->> 'salida')  AS sal_txt,
      (EXTRACT(HOUR   FROM a.entrada AT TIME ZONE 'America/Mexico_City')*60
     + EXTRACT(MINUTE FROM a.entrada AT TIME ZONE 'America/Mexico_City'))::int   AS ent_local,
      (EXTRACT(HOUR   FROM a.salida  AT TIME ZONE 'America/Mexico_City')*60
     + EXTRACT(MINUTE FROM a.salida  AT TIME ZONE 'America/Mexico_City'))::int   AS sal_local,
      ROUND((EXTRACT(EPOCH FROM (a.salida - a.entrada))/3600.0
             - COALESCE(h.minutos_comida,60)/60.0)::numeric, 2)                  AS horas_trab
  ) v
  CROSS JOIN LATERAL (
    SELECT
      split_part(v.ent_txt,':',1)::int*60 + split_part(v.ent_txt,':',2)::int AS ent_prog,
      split_part(v.sal_txt,':',1)::int*60 + split_part(v.sal_txt,':',2)::int AS sal_prog
  ) p
  WHERE emp.horario_id IN (12,13)
    AND a.entrada IS NOT NULL
    AND v.ent_txt IS NOT NULL
)
UPDATE asistencias a
SET minutos_retardo       = c.new_retardo,
    horas_extra           = c.new_extra,
    salida_anticipada_min = c.new_antic
FROM calc c
WHERE c.id = a.id;

DELETE FROM incidencias i
USING empleados emp
WHERE i.empleado_id = emp.id
  AND emp.horario_id IN (12,13)
  AND i.tipo IN ('retardo','salida_anticipada');

INSERT INTO incidencias (empleado_id, tipo, descripcion, fecha)
SELECT a.empleado_id, 'retardo', 'Retardo de ' || a.minutos_retardo || ' min', a.fecha
FROM asistencias a JOIN empleados emp ON emp.id = a.empleado_id
WHERE emp.horario_id IN (12,13) AND a.minutos_retardo > 0;

INSERT INTO incidencias (empleado_id, tipo, descripcion, fecha)
SELECT a.empleado_id, 'salida_anticipada', 'Salida anticipada de ' || a.salida_anticipada_min || ' min', a.fecha
FROM asistencias a JOIN empleados emp ON emp.id = a.empleado_id
WHERE emp.horario_id IN (12,13) AND a.salida_anticipada_min > 0;

SELECT emp.nombre,
       to_char(a.fecha,'Dy DD-Mon') AS dia,
       to_char(a.entrada AT TIME ZONE 'America/Mexico_City','HH24:MI') AS entro,
       to_char(a.salida  AT TIME ZONE 'America/Mexico_City','HH24:MI') AS salio,
       a.minutos_retardo AS retardo,
       a.horas_extra     AS extra,
       a.salida_anticipada_min AS anticipada
FROM asistencias a JOIN empleados emp ON emp.id = a.empleado_id
WHERE emp.horario_id IN (12,13)
ORDER BY emp.nombre, a.fecha;

COMMIT;
