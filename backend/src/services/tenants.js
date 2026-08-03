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
