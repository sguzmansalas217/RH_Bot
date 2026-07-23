import readline from 'node:readline';
import { config } from '../config/index.js';
import { crearRouter } from '../handlers/messages.js';
import { pool } from '../db/pool.js';

/**
 * Simulador de WhatsApp en la terminal (sin teléfono ni QR).
 * Inyecta mensajes al mismo router que usa Baileys y muestra las respuestas.
 *
 * Uso:  npm run sim
 * Comandos:
 *   texto libre           → envía un mensaje de texto (lo interpreta la IA)
 *   /loc <lat> <lon>      → envía una ubicación (para entrada/salida)
 *   /file [nombre]        → simula enviar un archivo (comprobante de incapacidad)
 *   /from <numero>        → cambia el número que escribe (empleado)
 *   /admin                → escribe como administrador
 *   /help                 → ayuda
 *   /exit                 → salir
 */

// Canal "sim": imprime en consola en lugar de enviar por WhatsApp
function crearCanalSim() {
  let handler = null;
  const paint = (to, text) =>
    console.log(`\n🤖 → ${to}:\n${text.split('\n').map((l) => '   ' + l).join('\n')}\n`);
  return {
    name: 'sim',
    start: async () => {},
    onMessage: (h) => (handler = h),
    sendText: async (to, text) => paint(to, text),
    requestLocation: async (to, text) =>
      paint(to, `${text}\n(usa: /loc <lat> <lon>  — la obra demo está en 19.4326 -99.1332)`),
    _ingest: (msg) => handler && handler(msg),
  };
}

const canal = crearCanalSim();
const router = crearRouter(canal);
canal.onMessage((m) => router.manejar(m));

const DEMO = '5210000000001';
let from = DEMO;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = () => rl.setPrompt(`👤 ${from}> `) || rl.prompt();

console.log(`
╔══════════════════════════════════════════════════════════╗
║   SIMULADOR RH · WhatsApp (terminal)                      ║
╠══════════════════════════════════════════════════════════╣
║  Empleado demo: ${DEMO}                        ║
║  Admin:         ${(config.whatsapp.admins[0] || 'no configurado').padEnd(24)} ║
║  Escribe /help para ver los comandos.                    ║
╚══════════════════════════════════════════════════════════╝
`);
prompt();

rl.on('line', async (line) => {
  const t = line.trim();
  try {
    if (!t) return prompt();

    if (t === '/exit') { rl.close(); return; }
    if (t === '/help') {
      console.log(`
Comandos:
  <texto>            enviar mensaje de texto
  /loc <lat> <lon>   enviar ubicación (obra demo: 19.4326 -99.1332)
  /file [nombre]     simular envío de archivo (comprobante)
  /from <numero>     cambiar de empleado
  /admin             escribir como administrador
  /exit              salir

Ejemplos de conversación:
  Llegué                 →  pide ubicación
  /loc 19.4326 -99.1332  →  registra entrada (dentro de la geocerca)
  /loc 19.50 -99.20      →  fuera de geocerca (genera incidencia)
  Necesito permiso mañana
  ¿Cuántas vacaciones me quedan?
  ¿Cuánto voy a cobrar esta semana?
  Tengo incapacidad      →  luego /file comprobante.pdf
`);
      return prompt();
    }
    if (t.startsWith('/from ')) { from = t.slice(6).trim(); console.log(`✏️  Ahora escribes como ${from}`); return prompt(); }
    if (t === '/admin') {
      from = config.whatsapp.admins[0];
      if (!from) console.log('⚠️  No hay ADMIN_WHATSAPP en .env');
      else console.log(`✏️  Ahora escribes como ADMIN (${from})`);
      return prompt();
    }

    if (t.startsWith('/loc ')) {
      const [, lat, lon] = t.split(/\s+/);
      await canal._ingest({ from, type: 'ubicacion', text: null, location: { lat: Number(lat), lon: Number(lon) }, downloadMedia: null });
      return prompt();
    }

    if (t.startsWith('/file')) {
      const nombre = t.split(/\s+/)[1] || 'comprobante.pdf';
      await canal._ingest({
        from, type: 'archivo', text: null, location: null,
        downloadMedia: async () => ({ buffer: Buffer.from('archivo simulado'), mimetype: 'application/pdf', filename: nombre }),
      });
      return prompt();
    }

    // Texto normal
    await canal._ingest({ from, type: 'texto', text: t, location: null, downloadMedia: null });
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  prompt();
});

rl.on('close', async () => {
  await pool.end();
  console.log('👋 Simulador cerrado.');
  process.exit(0);
});
