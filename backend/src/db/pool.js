import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool(
  config.db.connectionString
    ? { connectionString: config.db.connectionString }
    : {
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
      }
);

export const query = (text, params) => pool.query(text, params);

// Helper: primera fila o null
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

// Transacción
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
