import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

// Conceptos de nómina base que toda empresa nueva necesita.
const CONCEPTOS_BASE = [
  ['SUELDO', 'Sueldo', 'percepcion', true],
  ['HRS_EXTRA', 'Horas extra', 'percepcion', true],
  ['BONO_PUNT', 'Bono de puntualidad', 'percepcion', true],
  ['BONO_ASIST', 'Bono de asistencia', 'percepcion', true],
  ['BONO_PROD', 'Bono de productividad', 'percepcion', true],
  ['COMISION', 'Comisiones', 'percepcion', true],
  ['ISR', 'ISR', 'deduccion', false],
  ['IMSS', 'IMSS', 'deduccion', false],
  ['INFONAVIT', 'INFONAVIT', 'deduccion', false],
  ['FONACOT', 'FONACOT', 'deduccion', false],
  ['PRESTAMO', 'Préstamo', 'deduccion', false],
  ['DESC_FALTA', 'Descuento por falta', 'deduccion', false],
  ['DESC_RETARDO', 'Descuento por retardo', 'deduccion', false],
];

/**
 * Siembra los catálogos base de una empresa (departamentos, puestos, un horario
 * y los conceptos de nómina). Idempotente. Recibe un client de transacción.
 * Fuente única de verdad usada por el seed y por el alta de empresas nuevas.
 */
export async function sembrarCatalogos(client, empresaId) {
  await client.query(
    `INSERT INTO departamentos (empresa_id, nombre) VALUES ($1,'Operaciones'),($1,'Administración')
     ON CONFLICT DO NOTHING`,
    [empresaId]
  );
  await client.query(
    `INSERT INTO puestos (empresa_id, nombre, salario_base)
     VALUES ($1,'Ayudante general',300),($1,'Oficial',450),($1,'Supervisor',700)
     ON CONFLICT DO NOTHING`,
    [empresaId]
  );
  await client.query(
    `INSERT INTO horarios (empresa_id, nombre, hora_entrada, hora_salida, dias_laborales)
     VALUES ($1,'Matutino','08:00','17:00','{1,2,3,4,5,6}')
     ON CONFLICT DO NOTHING`,
    [empresaId]
  );
  for (const [clave, nombre, naturaleza, gravable] of CONCEPTOS_BASE) {
    await client.query(
      `INSERT INTO conceptos_nomina (empresa_id, clave, nombre, naturaleza, gravable)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (empresa_id, clave) DO NOTHING`,
      [empresaId, clave, nombre, naturaleza, gravable]
    );
  }
}

/**
 * Crea una empresa nueva con su primer usuario administrador y los catálogos base,
 * todo en una transacción. Devuelve { id, nombre } de la empresa creada.
 */
export async function crearEmpresaConAdmin({
  nombre, rfc, adminNombre, adminEmail, adminPassword, adminWhatsapp,
}) {
  if (!nombre?.trim()) throw new Error('Falta el nombre de la empresa');
  if (!adminEmail?.trim() || !adminPassword) throw new Error('Falta correo o contraseña del admin');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const emp = await client.query(
      `INSERT INTO empresas (nombre, rfc) VALUES ($1,$2) RETURNING id, nombre`,
      [nombre.trim(), rfc?.trim() || null]
    );
    const empresa = emp.rows[0];

    const hash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `INSERT INTO usuarios_admin (empresa_id, nombre, email, password_hash, rol, whatsapp)
       VALUES ($1,$2,$3,$4,'admin',$5)`,
      [empresa.id, adminNombre?.trim() || 'Administrador', adminEmail.trim().toLowerCase(), hash, adminWhatsapp?.trim() || null]
    );

    await sembrarCatalogos(client, empresa.id);

    await client.query('COMMIT');
    return empresa;
  } catch (err) {
    await client.query('ROLLBACK');
    // Correo duplicado → mensaje claro para el panel
    if (err.code === '23505') throw new Error('Ya existe un usuario con ese correo');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Trae una empresa con su administrador principal (el primero que se creó),
 * para la pantalla de edición del súper-admin.
 */
export async function obtenerEmpresaConAdmin(empresaId) {
  const { rows: er } = await pool.query(
    `SELECT id, nombre, rfc FROM empresas WHERE id=$1`, [empresaId]
  );
  if (!er.length) return null;
  const { rows: ar } = await pool.query(
    `SELECT id, nombre, email, whatsapp FROM usuarios_admin
      WHERE empresa_id=$1 ORDER BY id LIMIT 1`, [empresaId]
  );
  return { ...er[0], admin: ar[0] || null };
}

/**
 * Actualiza los datos de una empresa (nombre, RFC) y de su administrador
 * principal (nombre, correo, WhatsApp y, opcionalmente, contraseña). Todo en
 * una transacción. La contraseña solo se cambia si viene con valor.
 */
export async function actualizarEmpresaConAdmin(empresaId, { nombre, rfc, admin }) {
  if (!nombre?.trim()) throw new Error('Falta el nombre de la empresa');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const er = await client.query(
      `UPDATE empresas SET nombre=$2, rfc=$3 WHERE id=$1 RETURNING id, nombre, rfc`,
      [empresaId, nombre.trim(), rfc?.trim() || null]
    );
    if (!er.rows.length) throw new Error('La empresa no existe');

    if (admin?.id) {
      if (!admin.email?.trim()) throw new Error('El correo del administrador es obligatorio');
      if (admin.password) {
        const hash = await bcrypt.hash(admin.password, 10);
        await client.query(
          `UPDATE usuarios_admin SET nombre=$2, email=$3, whatsapp=$4, password_hash=$5
            WHERE id=$1 AND empresa_id=$6`,
          [admin.id, admin.nombre?.trim() || 'Administrador', admin.email.trim().toLowerCase(),
            admin.whatsapp?.trim() || null, hash, empresaId]
        );
      } else {
        await client.query(
          `UPDATE usuarios_admin SET nombre=$2, email=$3, whatsapp=$4
            WHERE id=$1 AND empresa_id=$5`,
          [admin.id, admin.nombre?.trim() || 'Administrador', admin.email.trim().toLowerCase(),
            admin.whatsapp?.trim() || null, empresaId]
        );
      }
    }

    await client.query('COMMIT');
    return er.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new Error('Ya existe un usuario con ese correo');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Elimina DEFINITIVAMENTE una empresa y TODOS sus datos (empleados, obras,
 * asistencias, solicitudes, nómina, mensajes, admins, catálogos). Borrado
 * explícito hijo→padre en una transacción, sin depender de ON DELETE CASCADE.
 */
export async function eliminarEmpresa(empresaId) {
  const id = Number(empresaId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Empresa inválida');

  const client = await pool.connect();
  const empSub = `(SELECT id FROM empleados WHERE empresa_id=$1)`;
  try {
    await client.query('BEGIN');

    // ── Nómina: detalle → recibos → periodos ──
    await client.query(
      `DELETE FROM recibo_detalle WHERE recibo_id IN (
         SELECT r.id FROM recibos_nomina r
         JOIN periodos_nomina p ON p.id = r.periodo_id
        WHERE p.empresa_id = $1)`,
      [id]
    );
    await client.query(
      `DELETE FROM recibos_nomina WHERE periodo_id IN
        (SELECT id FROM periodos_nomina WHERE empresa_id = $1)`,
      [id]
    );
    await client.query(`DELETE FROM periodos_nomina WHERE empresa_id = $1`, [id]);

    // ── Datos ligados a los empleados de la empresa ──
    await client.query(`DELETE FROM empleado_conceptos WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM prestamos          WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM vacaciones         WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM permisos           WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM incapacidades      WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM incidencias        WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM asistencias        WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM empleado_obras     WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(`DELETE FROM mensajes_wa        WHERE empleado_id IN ${empSub}`, [id]);
    await client.query(
      `DELETE FROM conversacion_estado WHERE whatsapp IN
        (SELECT whatsapp FROM empleados WHERE empresa_id = $1)`,
      [id]
    );

    // ── Empleados y catálogos propios de la empresa ──
    await client.query(`DELETE FROM empleados        WHERE empresa_id = $1`, [id]);
    await client.query(`DELETE FROM conceptos_nomina WHERE empresa_id = $1`, [id]);
    await client.query(`DELETE FROM obras            WHERE empresa_id = $1`, [id]);
    await client.query(`DELETE FROM horarios         WHERE empresa_id = $1`, [id]);
    await client.query(`DELETE FROM puestos          WHERE empresa_id = $1`, [id]);
    await client.query(`DELETE FROM departamentos    WHERE empresa_id = $1`, [id]);
    await client.query(`DELETE FROM usuarios_admin   WHERE empresa_id = $1`, [id]);

    const r = await client.query(`DELETE FROM empresas WHERE id = $1 RETURNING id`, [id]);
    if (!r.rowCount) throw new Error('La empresa no existe');

    await client.query('COMMIT');
    return { id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Lista todas las empresas con conteos (para la pantalla de súper-admin). */
export async function listarEmpresas() {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.rfc, e.creado_en,
            (SELECT count(*) FROM empleados      x WHERE x.empresa_id=e.id AND x.activo=true) AS empleados,
            (SELECT count(*) FROM usuarios_admin u WHERE u.empresa_id=e.id AND u.activo=true) AS admins
       FROM empresas e ORDER BY e.id`
  );
  return rows;
}
