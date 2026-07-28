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

  // Normaliza el número destino al formato que Meta acepta para ENVIAR.
  // México: WhatsApp entrega el remitente como 521XXXXXXXXXX (13 dígitos, con el "1"),
  // pero para enviar hay que usar 52XXXXXXXXXX (sin el "1"), o Meta responde 131030.
  function normalizeTo(num) {
    const n = String(num).replace(/\D/g, '');
    if (n.startsWith('521') && n.length === 13) return '52' + n.slice(3);
    return n;
  }

  // Envío genérico: arma el body, hace el POST y registra el detalle si falla.
  async function enviar(to, payload, contexto) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizeTo(to), ...payload }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      logger.error({ status: res.status, to, detalle }, `Error ${contexto} Cloud API`);
    }
  }

  async function sendText(to, text) {
    await enviar(to, { type: 'text', text: { body: text } }, 'enviando texto');
  }

  async function requestLocation(to, text) {
    // Cloud API sí soporta botón nativo de solicitud de ubicación (interactive location_request)
    await enviar(
      to,
      {
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: { text },
          action: { name: 'send_location' },
        },
      },
      'solicitando ubicación'
    );
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
