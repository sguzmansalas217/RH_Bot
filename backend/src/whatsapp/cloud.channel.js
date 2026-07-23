import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

/**
 * Stub de WhatsApp Cloud API (oficial de Meta).
 *
 * Migración futura: implementar aquí sendText/requestLocation con fetch a
 * https://graph.facebook.com/v21.0/{phoneId}/messages y exponer el webhook
 * en routes/webhook.js para recibir mensajes. La lógica de negocio
 * (handlers/messageRouter) NO cambia porque respeta el mismo contrato.
 */
export function createCloudChannel() {
  const { token, phoneId } = config.whatsapp.cloud;
  let messageHandler = null;

  async function start() {
    if (!token || !phoneId) {
      logger.warn('Cloud API sin credenciales (WA_CLOUD_TOKEN / WA_CLOUD_PHONE_ID).');
    }
    logger.info('Canal Cloud API listo (los mensajes llegan por webhook).');
  }

  async function sendText(to, text) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) logger.error({ status: res.status }, 'Error enviando texto Cloud API');
  }

  async function requestLocation(to, text) {
    // Cloud API sí soporta botón nativo de solicitud de ubicación (interactive location_request)
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: { text },
          action: { name: 'send_location' },
        },
      }),
    });
    if (!res.ok) logger.error({ status: res.status }, 'Error solicitando ubicación Cloud API');
  }

  function onMessage(handler) {
    messageHandler = handler;
  }

  // El webhook HTTP llamará a esta función para inyectar mensajes normalizados.
  function ingest(normalized) {
    if (messageHandler) return messageHandler(normalized);
  }

  return { start, onMessage, sendText, requestLocation, ingest, name: 'cloud' };
}
