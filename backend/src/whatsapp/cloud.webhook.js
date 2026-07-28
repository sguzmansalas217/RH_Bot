import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

/**
 * Registra el webhook de WhatsApp Cloud API en la app Express.
 * Normaliza los mensajes al mismo contrato que Baileys y los inyecta con
 * channel.ingest(). Solo se usa cuando WHATSAPP_CHANNEL=cloud.
 */
export function registrarWebhook(app, channel) {
  // Verificación del webhook (GET) que exige Meta al configurarlo
  app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config.whatsapp.cloud.verifyToken) {
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  // Recepción de mensajes (POST)
  app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // responder rápido a Meta
    try {
      const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
      const msg = entry?.messages?.[0];
      logger.info(
        { tieneMensaje: !!msg, tieneEstado: !!entry?.statuses, campo: req.body?.entry?.[0]?.changes?.[0]?.field },
        '📩 Webhook POST recibido de Meta'
      );
      if (!msg) return;
      const from = msg.from;
      logger.info({ from, tipo: msg.type }, '📩 Mensaje entrante por Cloud API');

      let normalized;
      if (msg.type === 'location') {
        normalized = {
          from,
          type: 'ubicacion',
          text: null,
          location: { lat: msg.location.latitude, lon: msg.location.longitude },
          downloadMedia: null,
        };
      } else if (msg.type === 'image' || msg.type === 'document') {
        const media = msg.image || msg.document;
        normalized = {
          from,
          type: 'archivo',
          text: media.caption || null,
          location: null,
          downloadMedia: async () => descargarMediaCloud(media.id, media.mime_type),
        };
      } else {
        normalized = {
          from,
          type: 'texto',
          text: msg.text?.body || msg.button?.text || msg.interactive?.list_reply?.title || '',
          location: null,
          downloadMedia: null,
        };
      }
      await channel.ingest(normalized);
    } catch (err) {
      logger.error({ err }, 'Error en webhook Cloud API');
    }
  });
}

async function descargarMediaCloud(mediaId, mimetype) {
  const { token } = config.whatsapp.cloud;
  const meta = await (
    await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  const buffer = Buffer.from(await bin.arrayBuffer());
  return { buffer, mimetype, filename: `media_${mediaId}` };
}
