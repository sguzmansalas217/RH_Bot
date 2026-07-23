import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { one } from '../db/pool.js';

export async function login(req, res) {
  const { email, password } = req.body || {};
  const user = await one(`SELECT * FROM usuarios_admin WHERE email=$1 AND activo=true`, [email]);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = jwt.sign(
    { id: user.id, empresa_id: user.empresa_id, rol: user.rol },
    config.jwt.secret,
    { expiresIn: config.jwt.expires }
  );
  res.json({ token, usuario: { id: user.id, nombre: user.nombre, rol: user.rol } });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}
