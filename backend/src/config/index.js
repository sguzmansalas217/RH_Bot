import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga .env desde la raíz del proyecto (../../.env respecto a este archivo)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // fallback: .env local del backend

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  tz: process.env.TZ || 'America/Mexico_City',

  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expires: process.env.JWT_EXPIRES || '8h',
  },

  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AI_MODEL || 'claude-sonnet-5',
  },

  whatsapp: {
    channel: process.env.WHATSAPP_CHANNEL || 'baileys',
    baileysAuthDir: process.env.BAILEYS_AUTH_DIR || './.baileys_auth',
    // En redes corporativas con inspección SSL, Baileys no confía en el
    // certificado del proxy. Poner WHATSAPP_INSECURE_TLS=true lo omite (dev).
    insecureTLS: process.env.WHATSAPP_INSECURE_TLS === 'true',
    admins: (process.env.ADMIN_WHATSAPP || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cloud: {
      token: process.env.WA_CLOUD_TOKEN,
      phoneId: process.env.WA_CLOUD_PHONE_ID,
      verifyToken: process.env.WA_CLOUD_VERIFY_TOKEN,
    },
  },
};

// Zona horaria del proceso: toda la lógica de asistencia depende de esto.
process.env.TZ = config.tz;
