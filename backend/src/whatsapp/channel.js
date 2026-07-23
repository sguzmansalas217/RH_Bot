import { config } from '../config/index.js';
import { createBaileysChannel } from './baileys.channel.js';
import { createCloudChannel } from './cloud.channel.js';

/**
 * Interfaz MessagingChannel (contrato):
 *   start()                         → inicia la conexión
 *   onMessage(handler)              → registra callback para mensajes entrantes
 *   sendText(to, text)              → envía texto
 *   requestLocation(to, text)       → pide ubicación al usuario
 *
 * Mensaje entrante normalizado:
 *   {
 *     from: '5215555555555',
 *     type: 'texto' | 'ubicacion' | 'archivo',
 *     text: string | null,
 *     location: { lat, lon } | null,
 *     downloadMedia: async () => ({ buffer, mimetype, filename }) | null
 *   }
 *
 * Al cambiar WHATSAPP_CHANNEL=cloud, la lógica de negocio no cambia.
 */
export function createChannel() {
  switch (config.whatsapp.channel) {
    case 'cloud':
      return createCloudChannel();
    case 'baileys':
    default:
      return createBaileysChannel();
  }
}
