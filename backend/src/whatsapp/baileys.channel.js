import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import https from 'node:https';
import qrcode from 'qrcode-terminal';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

/**
 * Canal WhatsApp basado en Baileys (no oficial).
 * ⚠️ Riesgo de baneo del número. Para producción migrar a Cloud API.
 */
export function createBaileysChannel() {
  let sock = null;
  let messageHandler = null;
  let reintentos = 0;
  const MAX_REINTENTOS = 5;

  // Convierte '5215555555555' → JID de WhatsApp
  const toJid = (num) => (num.includes('@') ? num : `${num}@s.whatsapp.net`);
  // Extrae número desde un JID
  const fromJid = (jid) => jid.split('@')[0].split(':')[0];

  async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(config.whatsapp.baileysAuthDir);

    // Usa la versión ACTUAL de WhatsApp Web. Sin esto, Baileys usa una versión fija
    // que WhatsApp rechaza con "Connection Failure (code 405)" y nunca aparece el QR.
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ version, isLatest }, '📦 Versión de WhatsApp Web para Baileys');

    // Redes corporativas con inspección SSL: agente que no valida el certificado
    // del proxy (solo para la conexión de WhatsApp; actívalo con WHATSAPP_INSECURE_TLS).
    let agent;
    if (config.whatsapp.insecureTLS) {
      agent = new https.Agent({ rejectUnauthorized: false });
      logger.warn('⚠️ WHATSAPP_INSECURE_TLS activo: se omite la validación del certificado (proxy corporativo).');
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ mod: 'baileys' }),
      markOnlineOnConnect: false,
      browser: ['RH Bot', 'Chrome', '120.0.0'],
      // Un bot NO necesita el historial de chats. Desactivarlo evita descargas
      // pesadas (y errores 408/decrypt) que ahogan un servidor con poca RAM.
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      agent,
      fetchAgent: agent,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        logger.info('📱 Escanea este QR con WhatsApp para vincular el sistema:');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') {
        reintentos = 0;
        logger.info('✅ WhatsApp conectado (Baileys)');
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut && reintentos < MAX_REINTENTOS;
        reintentos++;
        // Espera creciente (5s, 10s, 20s...) para no martillar a WhatsApp y evitar bloqueos
        const espera = Math.min(5000 * 2 ** (reintentos - 1), 60000);
        logger.warn(
          { code, reintentos },
          shouldReconnect
            ? `⚠️ Conexión cerrada (code ${code}). Reintentando en ${espera / 1000}s…`
            : `❌ Conexión cerrada (code ${code}). Sin más reintentos. Revisa la red/QR.`
        );
        if (shouldReconnect) setTimeout(() => start(), espera);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        if (msg.key.remoteJid?.endsWith('@g.us')) continue; // ignora grupos
        const normalized = normalize(msg);
        if (normalized && messageHandler) {
          try {
            await messageHandler(normalized);
          } catch (err) {
            logger.error({ err }, 'Error procesando mensaje entrante');
          }
        }
      }
    });
  }

  function normalize(msg) {
    const from = fromJid(msg.key.remoteJid);
    const m = msg.message;
    const content = m.ephemeralMessage?.message || m;

    // Ubicación
    const loc = content.locationMessage;
    if (loc) {
      return {
        from,
        type: 'ubicacion',
        text: null,
        location: { lat: loc.degreesLatitude, lon: loc.degreesLongitude },
        downloadMedia: null,
      };
    }

    // Imagen o documento (comprobantes)
    const media = content.imageMessage || content.documentMessage;
    if (media) {
      return {
        from,
        type: 'archivo',
        text: media.caption || null,
        location: null,
        downloadMedia: async () => {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          return {
            buffer,
            mimetype: media.mimetype || 'application/octet-stream',
            filename: content.documentMessage?.fileName || `archivo_${Date.now()}`,
          };
        },
      };
    }

    // Texto
    const text =
      content.conversation ||
      content.extendedTextMessage?.text ||
      content.buttonsResponseMessage?.selectedDisplayText ||
      content.listResponseMessage?.title ||
      null;

    if (text) {
      return { from, type: 'texto', text, location: null, downloadMedia: null };
    }
    return null;
  }

  async function sendText(to, text) {
    if (!sock) throw new Error('WhatsApp no conectado');
    await sock.sendMessage(toJid(to), { text });
  }

  async function requestLocation(to, text) {
    // Baileys no tiene un botón nativo fiable de "solicitar ubicación";
    // pedimos que la comparta desde el clip 📎 → Ubicación.
    await sendText(
      to,
      `${text}\n\n📍 Por favor comparte tu *ubicación actual*:\n` +
        `Toca 📎 (clip) → *Ubicación* → *Enviar tu ubicación actual*.`
    );
  }

  function onMessage(handler) {
    messageHandler = handler;
  }

  return { start, onMessage, sendText, requestLocation, name: 'baileys' };
}
