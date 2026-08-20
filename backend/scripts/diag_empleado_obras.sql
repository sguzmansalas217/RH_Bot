-- Diagnóstico: por qué el bot dice "no tienes obra asignada".
-- Solo lectura. Cambia el número si necesitas revisar a otra persona.
\set wa '5214493534641'

-- 1) Datos del empleado
SELECT id, nombre, whatsapp, activo, empresa_id, horario_id
FROM empleados
WHERE whatsapp = :'wa';

-- 2) Obras ligadas al empleado y su estado (activa / a qué empresa pertenece)
SELECT e.nombre               AS empleado,
       e.empresa_id           AS empresa_empleado,
       o.id                   AS obra_id,
       o.nombre               AS obra,
       o.activa               AS obra_activa,
       o.empresa_id           AS empresa_obra,
       (o.ubicacion IS NOT NULL) AS tiene_ubicacion,
       o.radio_metros
FROM empleados e
LEFT JOIN empleado_obras eo ON eo.empleado_id = e.id
LEFT JOIN obras o          ON o.id = eo.obra_id
WHERE e.whatsapp = :'wa'
ORDER BY o.nombre;
