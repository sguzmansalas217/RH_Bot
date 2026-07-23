import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { logger } from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    logger.info('✅ Migración completada: esquema aplicado');
  } catch (err) {
    logger.error({ err }, '❌ Error en migración');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
