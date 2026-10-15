import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { one } from '../db/pool.js';

const VENTANA_MS = 24 * 3600 * 1000; // Meta solo permite texto libre 24 h después del último mensaje del usuario

/**
 * Canal WhatsApp Cloud API (oficial de Meta).
 * Los mensajes entran por el webhook (cloud.webhook.js → ingest) y salen por
 * https://graph.facebook.com/v21.0/{phoneId}/messages. Respeta el mismo
 * contrato que Baileys, así la lógica de negocio no cambia.
 *
 * Ventana de 24 h: si el destinatario no ha escrito en las últimas 24 h, Meta
 * rechaza el texto libre. En ese caso se envía la plantilla aprobada
 * WA_TEMPLATE_AVISO (cuerpo con una sola variable {{1}}) con el texto adentro.
 */
export function createCloudChannel() {
  const { token, phoneId, templateAviso, templateIdioma } = config.whatsapp.cloud;
  let messageHandler = null;
  const ultimoEntrante = new Map(); // últimos 10 dígitos → timestamp del último mensaje recibido

  async function start() {
    if (!token || !phoneId) {
      logger.warn('Cloud API sin credenciales (WA_CLOUD_TOKEN / WA_CLOUD_PHONE_ID).');
    }
    if (!templateAviso) {
      logger.warn('Sin WA_TEMPLATE_AVISO: los avisos a quien no haya escrito en 24 h no se podrán entregar.');
    }
    logger.info('Canal Cloud API listo (los mensajes llegan por webhook).');
  }

  // Normaliza el número destino al formato que Meta acepta para ENVIAR.
  // México: WhatsApp entrega el remitente como 521XXXXXXXXXX (13 dígitos, con el "1"),
  // pero para enviar hay que usar 52XXXXXXXXXX (sin el "1"), o Meta responde 131030.
  function normalizeTo(num) {
    const n = String(num).replace(/\D/g, '');
    if (n.startsWith('521') && n.length === 13) return '52' + n.slice(3);
    if (n.length === 10) return '52' + n;
    return n;
  }
  const diez = (num) => String(num || '').replace(/\D/g, '').slice(-10);

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
    return res.ok;
  }

  // ¿El destinatario escribió en las últimas 24 h? (memoria del proceso o bitácora mensajes_wa)
  async function dentroDeVentana(to) {
    const k = diez(to);
    const enMemoria = ultimoEntrante.get(k);
    if (enMemoria) return Date.now() - enMemoria < VENTANA_MS;
    try {
      const r = await one(
        `SELECT max(creado_en) AS ultimo FROM mensajes_wa
          WHERE direccion = 'entrante' AND right(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $1`,
        [k]
      );
      if (!r?.ultimo) return false;
      ultimoEntrante.set(k, new Date(r.ultimo).getTime());
      return Date.now() - new Date(r.ultimo).getTime() < VENTANA_MS;
    } catch (err) {
      logger.warn({ err }, 'No se pudo revisar la ventana de 24 h; se intenta texto libre');
      return true;
    }
  }

  // Las variables de plantilla no aceptan saltos de línea ni muchos espacios seguidos.
  const comoParametro = (texto) =>
    String(texto).replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim().slice(0, 1000);

  async function sendText(to, text) {
    if (templateAviso && !(await dentroDeVentana(to))) {
      return enviar(
        to,
        {
          type: 'template',
          template: {
            name: templateAviso,
            language: { code: templateIdioma },
            components: [{ type: 'body', parameters: [{ type: 'text', text: comoParametro(text) }] }],
          },
        },
        'enviando plantilla de aviso'
      );
    }
    return enviar(to, { type: 'text', text: { body: text } }, 'enviando texto');
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
    ultimoEntrante.set(diez(normalized.from), Date.now());
    if (messageHandler) return messageHandler(normalized);
  }

  // Número público del canal (para el login); en Cloud se toma de WHATSAPP_NUMERO_PUBLICO.
  const numero = () => config.whatsapp.numeroPublico || null;

  return { start, onMessage, sendText, requestLocation, ingest, numero, name: 'cloud' };
}
