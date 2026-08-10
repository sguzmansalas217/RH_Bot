import { Router } from 'express';
import { login, requireAuth, requireSuperadmin } from './auth.js';
import { crearEmpresaConAdmin, listarEmpresas, eliminarEmpresa, obtenerEmpresaConAdmin, actualizarEmpresaConAdmin } from '../services/tenants.js';
import { listarTarifasISR, guardarTarifasISR, listarIMSS, guardarIMSS } from '../services/fiscal.js';
import { one, query } from '../db/pool.js';
import { crearObra, actualizarObra, eliminarObra } from '../services/geofence.js';
import { eliminarEmpleado } from '../services/employees.js';
import { resolver, pendientes, ausencias } from '../services/leaves.js';
import { calcularNomina } from '../services/payroll/index.js';
import { asistenciaExcel, reciboPDF } from '../reports/reports.js';
import { logger } from '../config/logger.js';

// Formatea una fecha a texto legible (ej. "5 de agosto de 2026").
// Acepta objetos Date (como los devuelve node-postgres) o cadenas "YYYY-MM-DD".
function fechaLegible(f) {
  if (!f) return '';
  const d = f instanceof Date ? f : new Date(String(f).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Arma el mensaje de WhatsApp que se le envía al empleado al resolver su solicitud.
function mensajeResolucion(tipo, estatus, row, observaciones) {
  const aprobado = String(estatus).startsWith('aprob');
  const icono = aprobado ? '✅' : '❌';
  const palabra = aprobado ? 'APROBADA' : 'RECHAZADA';
  let detalle = '';
  if (tipo === 'permiso') {
    const rango = row.fecha_fin && row.fecha_fin !== row.fecha_inicio
      ? `del ${fechaLegible(row.fecha_inicio)} al ${fechaLegible(row.fecha_fin)}`
      : `para el ${fechaLegible(row.fecha_inicio)}`;
    detalle = `tu *permiso* ${rango}`;
  } else if (tipo === 'vacacion') {
    detalle = `tus *vacaciones* del ${fechaLegible(row.fecha_inicio)} al ${fechaLegible(row.fecha_fin)} (${row.dias} días)`;
  } else if (tipo === 'incapacidad') {
    detalle = `tu *incapacidad* desde el ${fechaLegible(row.fecha_inicio)}`;
  } else {
    detalle = 'tu solicitud';
  }
  let msg = `${icono} Hola, ${detalle} fue *${palabra}* por Recursos Humanos.`;
  if (observaciones) msg += `\n\n📝 Observaciones: ${observaciones}`;
  return msg;
}

// Envía la notificación al empleado sin bloquear la respuesta HTTP del panel.
async function notificarEmpleado(req, tipo, estatus, row, observaciones) {
  try {
    const channel = req.app.get('channel');
    if (!channel || !row?.empleado_id) return;
    const empleado = await one(`SELECT whatsapp, nombre FROM empleados WHERE id=$1`, [row.empleado_id]);
    if (!empleado?.whatsapp) return;
    await channel.sendText(empleado.whatsapp, mensajeResolucion(tipo, estatus, row, observaciones));
    logger.info({ empleado: empleado.nombre, tipo, estatus }, '📤 Empleado notificado de la resolución');
  } catch (err) {
    logger.error({ err }, 'No se pudo notificar al empleado la resolución');
  }
}

export const api = Router();

api.post('/login', login);

// Todo lo demás requiere token
api.use(requireAuth);
const emp = (req) => req.user.empresa_id;

// ─── Súper-admin: alta y listado de empresas (dueño del sistema) ───
api.get('/admin/empresas', requireSuperadmin, async (req, res) => {
  res.json(await listarEmpresas());
});
api.post('/admin/empresas', requireSuperadmin, async (req, res) => {
  try {
    const empresa = await crearEmpresaConAdmin(req.body || {});
    res.status(201).json(empresa);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear la empresa' });
  }
});
// Datos de una empresa + su administrador principal (para editar como súper-admin).
api.get('/admin/empresas/:id', requireSuperadmin, async (req, res) => {
  const row = await obtenerEmpresaConAdmin(req.params.id);
  if (!row) return res.status(404).json({ error: 'Empresa no encontrada.' });
  res.json(row);
});
// Editar datos de la empresa (nombre / RFC) y de su administrador principal.
api.put('/admin/empresas/:id', requireSuperadmin, async (req, res) => {
  try {
    res.json(await actualizarEmpresaConAdmin(req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo actualizar la empresa' });
  }
});
// Borrado DEFINITIVO de una empresa y todos sus datos.
api.delete('/admin/empresas/:id', requireSuperadmin, async (req, res) => {
  try {
    res.json(await eliminarEmpresa(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo eliminar la empresa' });
  }
});

// ─── Súper-admin: tablas fiscales ISR / IMSS (nacionales, compartidas) ───
api.get('/admin/isr', requireSuperadmin, async (req, res) => {
  res.json(await listarTarifasISR(req.query.periodo || 'semanal'));
});
api.put('/admin/isr', requireSuperadmin, async (req, res) => {
  try {
    const { periodo, renglones } = req.body || {};
    res.json(await guardarTarifasISR(periodo, renglones));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar la tabla de ISR' });
  }
});
api.get('/admin/imss', requireSuperadmin, async (_req, res) => {
  res.json(await listarIMSS());
});
api.put('/admin/imss', requireSuperadmin, async (req, res) => {
  try {
    res.json(await guardarIMSS(req.body?.parametros || []));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar IMSS' });
  }
});

// ─── Empleados ───
// Sincroniza las obras asignadas a un empleado (tabla empleado_obras).
// obraIds: array de IDs. Si no es un array, no toca las asignaciones.
async function sincronizarObras(empleadoId, obraIds) {
  if (!Array.isArray(obraIds)) return;
  await query(`DELETE FROM empleado_obras WHERE empleado_id=$1`, [empleadoId]);
  for (const oid of obraIds) {
    if (oid) {
      await query(
        `INSERT INTO empleado_obras (empleado_id, obra_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [empleadoId, oid]
      );
    }
  }
}

// Normaliza el cuerpo: acepta obra_ids (array, nuevo) o obra_id (único, viejo).
function obrasDelBody(b) {
  if (Array.isArray(b.obra_ids)) return b.obra_ids.filter(Boolean);
  if (b.obra_id) return [b.obra_id];
  return [];
}

api.get('/empleados', async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, p.nombre AS puesto, d.nombre AS departamento,
            COALESCE((SELECT string_agg(o.nombre, ', ' ORDER BY o.nombre)
                        FROM empleado_obras eo JOIN obras o ON o.id=eo.obra_id
                       WHERE eo.empleado_id=e.id), '') AS obra,
            COALESCE((SELECT array_agg(eo.obra_id)
                        FROM empleado_obras eo WHERE eo.empleado_id=e.id), '{}') AS obra_ids
       FROM empleados e
       LEFT JOIN puestos p ON p.id=e.puesto_id
       LEFT JOIN departamentos d ON d.id=e.departamento_id
      WHERE e.empresa_id=$1 AND e.activo=true ORDER BY e.nombre`,
    [emp(req)]
  );
  res.json(rows);
});

// Busca si un WhatsApp (por sus últimos 10 dígitos) ya está en uso por otro
// empleado. Devuelve { nombre, empresa } o null. Si `exceptoId` se indica,
// ignora a ese empleado (para permitir editar sin chocar consigo mismo).
async function whatsappEnUso(whatsapp, exceptoId = null) {
  const dig = String(whatsapp || '').replace(/\D/g, '').slice(-10);
  if (!dig) return null;
  return one(
    `SELECT e.nombre, em.nombre AS empresa
       FROM empleados e
       LEFT JOIN empresas em ON em.id = e.empresa_id
      WHERE right(regexp_replace(e.whatsapp, '\\D', '', 'g'), 10) = $1
        AND ($2::int IS NULL OR e.id <> $2)
      LIMIT 1`,
    [dig, exceptoId]
  );
}

api.post('/empleados', async (req, res) => {
  try {
    const b = req.body;
    const dup = await whatsappEnUso(b.whatsapp);
    if (dup) {
      return res.status(409).json({
        error: `Ese WhatsApp ya está registrado como "${dup.nombre}"${dup.empresa ? ` en la empresa ${dup.empresa}` : ''}. Un mismo número no puede estar en dos empresas.`,
      });
    }
    const obras = obrasDelBody(b);
    const row = await one(
      `INSERT INTO empleados
         (empresa_id, numero_empleado, nombre, whatsapp, curp, rfc, nss,
          departamento_id, puesto_id, obra_id, horario_id, salario_diario,
          salario_diario_integrado, fecha_ingreso, dias_vacaciones_saldo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,CURRENT_DATE),$15)
       RETURNING *`,
      [emp(req), b.numero_empleado, b.nombre, b.whatsapp, b.curp, b.rfc, b.nss,
        b.departamento_id, b.puesto_id, obras[0] || null, b.horario_id, b.salario_diario || 0,
        b.salario_diario_integrado || 0, b.fecha_ingreso, b.dias_vacaciones_saldo || 0]
    );
    await sincronizarObras(row.id, obras);
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, 'No se pudo crear el empleado');
    res.status(400).json({ error: err.message || 'No se pudo crear el empleado' });
  }
});

api.put('/empleados/:id', async (req, res) => {
  try {
    const b = req.body;
    if (b.whatsapp) {
      const dup = await whatsappEnUso(b.whatsapp, Number(req.params.id));
      if (dup) {
        return res.status(409).json({
          error: `Ese WhatsApp ya está registrado como "${dup.nombre}"${dup.empresa ? ` en la empresa ${dup.empresa}` : ''}. Un mismo número no puede estar en dos empresas.`,
        });
      }
    }
    const obras = obrasDelBody(b);
    const row = await one(
      `UPDATE empleados SET
          nombre=COALESCE($2,nombre), whatsapp=COALESCE($3,whatsapp),
          departamento_id=$4, puesto_id=$5, obra_id=$6, horario_id=$7,
          salario_diario=COALESCE($8,salario_diario),
          salario_diario_integrado=COALESCE($9,salario_diario_integrado),
          dias_vacaciones_saldo=COALESCE($10,dias_vacaciones_saldo)
        WHERE id=$1 AND empresa_id=$11 RETURNING *`,
      [req.params.id, b.nombre, b.whatsapp, b.departamento_id, b.puesto_id, obras[0] || null,
        b.horario_id, b.salario_diario, b.salario_diario_integrado, b.dias_vacaciones_saldo, emp(req)]
    );
    await sincronizarObras(row.id, obras);
    res.json(row);
  } catch (err) {
    logger.error({ err }, 'No se pudo actualizar el empleado');
    res.status(400).json({ error: err.message || 'No se pudo actualizar el empleado' });
  }
});

// Baja de empleado: lo elimina por completo de todas las tablas para que su
// número de WhatsApp quede libre y se pueda volver a registrar.
api.delete('/empleados/:id', async (req, res) => {
  try {
    res.json(await eliminarEmpleado(req.params.id, emp(req)));
  } catch (err) {
    logger.error({ err }, 'No se pudo dar de baja al empleado');
    res.status(400).json({ error: err.message || 'No se pudo dar de baja al empleado' });
  }
});

// ─── Catálogos ───
for (const [ruta, tabla] of [['departamentos', 'departamentos'], ['puestos', 'puestos'], ['horarios', 'horarios']]) {
  api.get(`/${ruta}`, async (req, res) => {
    const { rows } = await query(`SELECT * FROM ${tabla} WHERE empresa_id=$1 ORDER BY id`, [emp(req)]);
    res.json(rows);
  });
}
api.post('/departamentos', async (req, res) => {
  res.status(201).json(await one(`INSERT INTO departamentos (empresa_id,nombre) VALUES ($1,$2) RETURNING *`, [emp(req), req.body.nombre]));
});
api.put('/departamentos/:id', async (req, res) => {
  res.json(await one(`UPDATE departamentos SET nombre=$2 WHERE id=$1 AND empresa_id=$3 RETURNING *`, [req.params.id, req.body.nombre, emp(req)]));
});
api.delete('/departamentos/:id', async (req, res) => {
  await query(`UPDATE empleados SET departamento_id=NULL WHERE departamento_id=$1`, [req.params.id]);
  await query(`DELETE FROM departamentos WHERE id=$1 AND empresa_id=$2`, [req.params.id, emp(req)]);
  res.json({ ok: true });
});
api.post('/puestos', async (req, res) => {
  res.status(201).json(await one(`INSERT INTO puestos (empresa_id,nombre,salario_base) VALUES ($1,$2,$3) RETURNING *`, [emp(req), req.body.nombre, req.body.salario_base || 0]));
});
api.put('/puestos/:id', async (req, res) => {
  const b = req.body;
  res.json(await one(`UPDATE puestos SET nombre=$2, salario_base=$3 WHERE id=$1 AND empresa_id=$4 RETURNING *`, [req.params.id, b.nombre, b.salario_base || 0, emp(req)]));
});
api.delete('/puestos/:id', async (req, res) => {
  await query(`UPDATE empleados SET puesto_id=NULL WHERE puesto_id=$1`, [req.params.id]);
  await query(`DELETE FROM puestos WHERE id=$1 AND empresa_id=$2`, [req.params.id, emp(req)]);
  res.json({ ok: true });
});
// Normaliza el cuerpo de un horario. Si viene `dias_horario` (horario por día),
// deriva de él los días laborales y una hora de entrada/salida representativa
// (para compatibilidad con el modo simple y consultas legadas).
function normalizaHorario(b) {
  const dh = b.dias_horario && typeof b.dias_horario === 'object' ? b.dias_horario : null;
  let dias = Array.isArray(b.dias_laborales) ? b.dias_laborales : [1, 2, 3, 4, 5, 6];
  let entrada = b.hora_entrada || '08:00';
  let salida = b.hora_salida || '17:00';
  if (dh) {
    const claves = Object.keys(dh)
      .filter((k) => dh[k] && dh[k].entrada && dh[k].salida)
      .map(Number)
      .sort((a, c) => a - c);
    dias = claves;
    const rep = dh['1'] || (claves.length ? dh[claves[0]] : null); // lunes o el primer día
    if (rep) { entrada = rep.entrada; salida = rep.salida; }
  }
  return { dh: dh ? JSON.stringify(dh) : null, dias, entrada, salida, comida: b.minutos_comida || 60 };
}

api.post('/horarios', async (req, res) => {
  const h = normalizaHorario(req.body);
  res.status(201).json(await one(
    `INSERT INTO horarios (empresa_id,nombre,hora_entrada,hora_salida,dias_laborales,minutos_comida,dias_horario)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [emp(req), req.body.nombre, h.entrada, h.salida, h.dias, h.comida, h.dh]
  ));
});
api.put('/horarios/:id', async (req, res) => {
  const h = normalizaHorario(req.body);
  res.json(await one(
    `UPDATE horarios SET nombre=$2, hora_entrada=$3, hora_salida=$4, dias_laborales=$5, minutos_comida=$6, dias_horario=$7
      WHERE id=$1 AND empresa_id=$8 RETURNING *`,
    [req.params.id, req.body.nombre, h.entrada, h.salida, h.dias, h.comida, h.dh, emp(req)]
  ));
});
api.delete('/horarios/:id', async (req, res) => {
  await query(`UPDATE empleados SET horario_id=NULL WHERE horario_id=$1`, [req.params.id]);
  await query(`DELETE FROM horarios WHERE id=$1 AND empresa_id=$2`, [req.params.id, emp(req)]);
  res.json({ ok: true });
});

// ─── Conceptos de nómina (bonos / deducciones) ───
// Claves especiales que el cálculo de nómina reconoce:
//   BONO_PUNT  → solo se paga si NO hubo retardos en el periodo
//   BONO_ASIST → solo se paga si NO hubo faltas en el periodo
api.get('/conceptos', async (req, res) => {
  const { rows } = await query(`SELECT * FROM conceptos_nomina WHERE empresa_id=$1 ORDER BY nombre`, [emp(req)]);
  res.json(rows);
});
api.post('/conceptos', async (req, res) => {
  const b = req.body;
  res.status(201).json(await one(
    `INSERT INTO conceptos_nomina (empresa_id, clave, nombre, naturaleza, gravable)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [emp(req), b.clave, b.nombre, b.naturaleza || 'percepcion', b.gravable !== false]
  ));
});
api.put('/conceptos/:id', async (req, res) => {
  const b = req.body;
  res.json(await one(
    `UPDATE conceptos_nomina SET clave=$2, nombre=$3, naturaleza=$4, gravable=$5
      WHERE id=$1 AND empresa_id=$6 RETURNING *`,
    [req.params.id, b.clave, b.nombre, b.naturaleza || 'percepcion', b.gravable !== false, emp(req)]
  ));
});
api.delete('/conceptos/:id', async (req, res) => {
  await query(`DELETE FROM empleado_conceptos WHERE concepto_id=$1`, [req.params.id]);
  await query(`DELETE FROM conceptos_nomina WHERE id=$1 AND empresa_id=$2`, [req.params.id, emp(req)]);
  res.json({ ok: true });
});

// ─── Asignaciones de conceptos a empleados (bono/deducción por empleado) ───
api.get('/asignaciones', async (req, res) => {
  const { rows } = await query(
    `SELECT ec.id, ec.empleado_id, ec.concepto_id, ec.monto, ec.porcentaje, ec.activo,
            e.nombre AS empleado, c.nombre AS concepto, c.clave, c.naturaleza
       FROM empleado_conceptos ec
       JOIN empleados e ON e.id=ec.empleado_id
       JOIN conceptos_nomina c ON c.id=ec.concepto_id
      WHERE e.empresa_id=$1 ORDER BY e.nombre, c.nombre`,
    [emp(req)]
  );
  res.json(rows);
});
api.post('/asignaciones', async (req, res) => {
  const b = req.body;
  res.status(201).json(await one(
    `INSERT INTO empleado_conceptos (empleado_id, concepto_id, monto, porcentaje, activo)
     VALUES ($1,$2,$3,$4,true) RETURNING *`,
    [b.empleado_id, b.concepto_id, b.monto || null, b.porcentaje || null]
  ));
});
api.delete('/asignaciones/:id', async (req, res) => {
  await query(`DELETE FROM empleado_conceptos WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── Configuración de la empresa ───
api.get('/empresa', async (req, res) => {
  res.json(await one(`SELECT * FROM empresas WHERE id=$1`, [emp(req)]));
});
api.put('/empresa', async (req, res) => {
  const b = req.body;
  res.json(await one(
    `UPDATE empresas SET
        nombre=COALESCE($2,nombre),
        horas_jornada=COALESCE($3,horas_jornada),
        tolerancia_retardo_min=COALESCE($4,tolerancia_retardo_min),
        factor_hora_extra_doble=COALESCE($5,factor_hora_extra_doble),
        factor_hora_extra_triple=COALESCE($6,factor_hora_extra_triple),
        prima_dominical_pct=COALESCE($7,prima_dominical_pct),
        dias_aguinaldo=COALESCE($8,dias_aguinaldo),
        prima_vacacional_pct=COALESCE($9,prima_vacacional_pct),
        mostrar_sueldo_empleado=COALESCE($10,mostrar_sueldo_empleado)
      WHERE id=$1 RETURNING *`,
    [emp(req), b.nombre, b.horas_jornada, b.tolerancia_retardo_min, b.factor_hora_extra_doble,
      b.factor_hora_extra_triple, b.prima_dominical_pct, b.dias_aguinaldo, b.prima_vacacional_pct,
      typeof b.mostrar_sueldo_empleado === 'boolean' ? b.mostrar_sueldo_empleado : null]
  ));
});

// ─── Obras / geocercas ───
api.get('/obras', async (req, res) => {
  const { rows } = await query(
    `SELECT id, nombre, tipo, radio_metros, activa,
            ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lon
       FROM obras WHERE empresa_id=$1 AND activa=true ORDER BY nombre`,
    [emp(req)]
  );
  res.json(rows);
});
api.post('/obras', async (req, res) => {
  const b = req.body;
  res.status(201).json(await crearObra({ empresaId: emp(req), ...b }));
});
api.put('/obras/:id', async (req, res) => {
  const b = req.body;
  const row = await actualizarObra({ id: req.params.id, empresaId: emp(req), ...b });
  if (!row) return res.status(404).json({ error: 'Obra no encontrada' });
  res.json(row);
});
api.delete('/obras/:id', async (req, res) => {
  await eliminarObra(req.params.id, emp(req));
  res.status(204).end();
});

// ─── Asistencias / incidencias ───
api.get('/asistencias', async (req, res) => {
  const { desde, hasta, empleado } = req.query;
  const empId = empleado ? Number(empleado) : null;
  const { rows } = await query(
    `SELECT a.*, e.nombre AS empleado, o.nombre AS obra
       FROM asistencias a JOIN empleados e ON e.id=a.empleado_id
       LEFT JOIN obras o ON o.id=a.obra_id
      WHERE e.empresa_id=$1 AND a.fecha BETWEEN $2 AND $3
        AND ($4::int IS NULL OR a.empleado_id = $4)
      ORDER BY a.fecha DESC, e.nombre`,
    [emp(req), desde || '2000-01-01', hasta || '2999-12-31', empId]
  );
  res.json(rows);
});
api.get('/incidencias', async (req, res) => {
  const { rows } = await query(
    `SELECT i.*, e.nombre AS empleado FROM incidencias i
       JOIN empleados e ON e.id=i.empleado_id
      WHERE e.empresa_id=$1 ORDER BY i.creado_en DESC LIMIT 200`,
    [emp(req)]
  );
  res.json(rows);
});

// ─── Solicitudes (aprobar/rechazar) ───
api.get('/pendientes', async (req, res) => res.json(await pendientes(emp(req))));
api.get('/ausencias', async (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const en90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const { desde, hasta } = req.query;
  res.json(await ausencias(emp(req), desde || hoy, hasta || en90));
});
api.post('/solicitudes/:tipo/:id/resolver', async (req, res) => {
  const { tipo, id } = req.params;
  const { estatus, observaciones } = req.body;
  const row = await resolver(tipo, id, { estatus, adminId: req.user.id, observaciones, empresaId: emp(req) });
  res.json(row);
  // Avisa al empleado por WhatsApp (después de responder, no bloquea el panel)
  notificarEmpleado(req, tipo, estatus, row, observaciones);
});

// ─── Nómina ───
api.post('/periodos', async (req, res) => {
  const b = req.body;
  res.status(201).json(await one(
    `INSERT INTO periodos_nomina (empresa_id,tipo,fecha_inicio,fecha_fin) VALUES ($1,$2,$3,$4) RETURNING *`,
    [emp(req), b.tipo || 'semanal', b.fecha_inicio, b.fecha_fin]
  ));
});
api.get('/periodos', async (req, res) => {
  const { rows } = await query(`SELECT * FROM periodos_nomina WHERE empresa_id=$1 ORDER BY fecha_inicio DESC`, [emp(req)]);
  res.json(rows);
});
api.post('/periodos/:id/calcular', async (req, res) => {
  try {
    res.json(await calcularNomina(parseInt(req.params.id, 10)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
api.get('/periodos/:id/recibos', async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, e.nombre AS empleado FROM recibos_nomina r
       JOIN empleados e ON e.id=r.empleado_id WHERE r.periodo_id=$1 ORDER BY e.nombre`,
    [req.params.id]
  );
  res.json(rows);
});

// ─── Reportes ───
api.get('/reportes/asistencia.xlsx', async (req, res) => {
  const { desde, hasta } = req.query;
  await asistenciaExcel(res, emp(req), desde || '2000-01-01', hasta || '2999-12-31');
});
api.get('/recibos/:id.pdf', async (req, res) => {
  await reciboPDF(res, parseInt(req.params.id, 10));
});
