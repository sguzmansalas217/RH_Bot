import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { api } from './api/routes.js';
import { createChannel } from './whatsapp/channel.js';
import { crearRouter } from './handlers/messages.js';
import { UPLOAD_DIR } from './services/files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API REST del panel
  app.use('/api', api);

  // Archivos subidos (comprobantes) y panel estático
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use('/', express.static(path.resolve(__dirname, '../../frontend/dist')));

  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // ── Canal WhatsApp + router de mensajes ──
  const channel = createChannel();
  const router = crearRouter(channel);
  channel.onMessage((msg) => router.manejar(msg));
  // Deja el canal disponible para las rutas del panel (p.ej. avisar al
  // empleado por WhatsApp cuando se aprueba/rechaza una solicitud).
  app.set('channel', channel);

  // Webhook para Cloud API (si se usa ese canal en el futuro)
  if (channel.name === 'cloud') {
    const { registrarWebhook } = await import('./whatsapp/cloud.webhook.js');
    registrarWebhook(app, channel);
  }

  await channel.start();

  app.listen(config.port, () => {
    logger.info(`🚀 Servidor en http://localhost:${config.port} (canal: ${channel.name})`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fallo al iniciar el servidor');
  process.exit(1);
});
