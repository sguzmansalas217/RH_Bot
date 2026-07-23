import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { logger } from '../config/logger.js';

/**
 * Datos semilla: empresa demo, admin, tablas fiscales (CONFIGURABLES, actualízalas
 * cada año), conceptos de nómina, y catálogos base para probar el sistema.
 */
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Empresa ──
    const emp = await client.query(
      `INSERT INTO empresas (nombre, rfc) VALUES ($1,$2)
       ON CONFLICT DO NOTHING RETURNING id`,
      ['Empresa Demo S.A. de C.V.', 'XAXX010101000']
    );
    const empresaId = emp.rows[0]?.id || 1;

    // ── Admin del panel ──
    const hash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO usuarios_admin (empresa_id, nombre, email, password_hash, rol, whatsapp)
       VALUES ($1,'Administrador','admin@demo.com',$2,'admin',$3)
       ON CONFLICT (email) DO NOTHING`,
      [empresaId, hash, (process.env.ADMIN_WHATSAPP || '').split(',')[0] || null]
    );

    // ── Catálogos base ──
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

    // ── Obra demo con geocerca (CDMX, radio 150 m) ──
    await client.query(
      `INSERT INTO obras (empresa_id, nombre, tipo, ubicacion, radio_metros)
       VALUES ($1,'Obra Centro','obra', ST_MakePoint(-99.1332, 19.4326)::geography, 150)
       ON CONFLICT DO NOTHING`,
      [empresaId]
    );

    // ── Empleado demo (para simulación inmediata) ──
    // Asignado a la Obra Centro y horario Matutino recién creados.
    const obraDemo = await client.query(
      `SELECT id FROM obras WHERE empresa_id=$1 ORDER BY id LIMIT 1`, [empresaId]
    );
    const horarioDemo = await client.query(
      `SELECT id FROM horarios WHERE empresa_id=$1 ORDER BY id LIMIT 1`, [empresaId]
    );
    const puestoDemo = await client.query(
      `SELECT id FROM puestos WHERE empresa_id=$1 ORDER BY id LIMIT 1`, [empresaId]
    );
    await client.query(
      `INSERT INTO empleados
         (empresa_id, numero_empleado, nombre, whatsapp, puesto_id, obra_id, horario_id,
          salario_diario, salario_diario_integrado, dias_vacaciones_saldo)
       VALUES ($1,'EMP001','Juan Pérez Demo','5210000000001',$2,$3,$4,400,420,12)
       ON CONFLICT (whatsapp) DO NOTHING`,
      [empresaId, puestoDemo.rows[0]?.id, obraDemo.rows[0]?.id, horarioDemo.rows[0]?.id]
    );

    // ── Conceptos de nómina ──
    const conceptos = [
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
    for (const [clave, nombre, naturaleza, gravable] of conceptos) {
      await client.query(
        `INSERT INTO conceptos_nomina (empresa_id, clave, nombre, naturaleza, gravable)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (empresa_id, clave) DO NOTHING`,
        [empresaId, clave, nombre, naturaleza, gravable]
      );
    }

    // ── Tarifa ISR SEMANAL (representativa — ACTUALIZAR cada año fiscal) ──
    await client.query(`DELETE FROM sat_tarifas_isr WHERE periodo='semanal'`);
    const isr = [
      [0.01, 171.78, 0.0, 1.92],
      [171.79, 1458.03, 3.29, 6.4],
      [1458.04, 2562.35, 85.61, 10.88],
      [2562.36, 2978.66, 205.8, 16.0],
      [2978.67, 3566.99, 272.37, 17.92],
      [3567.0, 7192.64, 377.8, 21.36],
      [7192.65, 11336.57, 1152.03, 23.52],
      [11336.58, 21641.63, 2126.86, 30.0],
      [21641.64, 28855.49, 5218.39, 32.0],
      [28855.5, 86566.47, 7526.81, 34.0],
      [86566.48, null, 27148.21, 35.0],
    ];
    for (const [li, ls, cuota, pct] of isr) {
      await client.query(
        `INSERT INTO sat_tarifas_isr (periodo, limite_inferior, limite_superior, cuota_fija, porcentaje)
         VALUES ('semanal',$1,$2,$3,$4)`,
        [li, ls, cuota, pct]
      );
    }

    // ── Parámetros IMSS obrero (porcentaje sobre SBC — CONFIGURABLE) ──
    const imss = [
      ['EM_EXCEDENTE', 'Enf. y mat. excedente 3 UMA', 0.4],
      ['EM_DINERO', 'Prestaciones en dinero', 0.25],
      ['GMP', 'Gastos médicos pensionados', 0.375],
      ['INV_VIDA', 'Invalidez y vida', 0.625],
      ['CES_VEJEZ', 'Cesantía y vejez', 1.125],
    ];
    for (const [clave, desc, pct] of imss) {
      await client.query(
        `INSERT INTO imss_parametros (clave, descripcion, porcentaje_obrero)
         VALUES ($1,$2,$3) ON CONFLICT (clave) DO UPDATE SET porcentaje_obrero=EXCLUDED.porcentaje_obrero`,
        [clave, desc, pct]
      );
    }

    await client.query('COMMIT');
    logger.info('✅ Seed completado. Login panel: admin@demo.com / admin123');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, '❌ Error en seed');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
