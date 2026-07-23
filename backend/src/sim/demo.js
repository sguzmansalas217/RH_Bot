import { config } from '../config/index.js';
import { crearRouter } from '../handlers/messages.js';
import { pool } from '../db/pool.js';

/**
 * Simulación AUTOMÁTICA de extremo a extremo (no interactiva).
 * Ejecuta un guion completo y muestra las respuestas del bot. Uso: npm run demo
 */

const EMP = '5210000000001'; // Juan Pérez (seed)
const ADMIN = config.whatsapp.admins[0] || '5215555555555';

function crearCanalSim() {
  let handler = null;
  const paint = (to, text) =>
    console.log(`   🤖 → ${to}:\n${text.split('\n').map((l) => '        ' + l).join('\n')}\n`);
  return {
    name: 'sim',
    start: async () => {},
    onMessage: (h) => (handler = h),
    sendText: async (to, text) => paint(to, text),
    requestLocation: async (to, text) => paint(to, `${text}\n(el empleado debe compartir ubicación)`),
    _ingest: (msg) => handler && handler(msg),
  };
}

const canal = crearCanalSim();
const router = crearRouter(canal);
canal.onMessage((m) => router.manejar(m));

const texto = (from, t) => ({ from, type: 'texto', text: t, location: null, downloadMedia: null });
const ubic = (from, lat, lon) => ({ from, type: 'ubicacion', text: null, location: { lat, lon }, downloadMedia: null });
const archivo = (from, nombre) => ({
  from, type: 'archivo', text: null, location: null,
  downloadMedia: async () => ({ buffer: Buffer.from('archivo simulado'), mimetype: 'application/pdf', filename: nombre }),
});

const paso = (titulo, quien, msg) => {
  console.log(`\n━━━ ${titulo} ━━━`);
  console.log(`   👤 ${quien}: ${msg}`);
};

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   SIMULACIÓN AUTOMÁTICA · Sistema RH por WhatsApp      ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  paso('1. Saludo', 'Juan', 'Hola');
  await canal._ingest(texto(EMP, 'Hola'));

  paso('2. Marca ENTRADA', 'Juan', 'Llegué');
  await canal._ingest(texto(EMP, 'Llegué'));

  paso('3. Comparte ubicación DENTRO de la obra', 'Juan', '📍 19.4326, -99.1332');
  await canal._ingest(ubic(EMP, 19.4326, -99.1332));

  paso('4. Intenta entrada FUERA de la geocerca (otro empleado ficticio)', 'Juan', 'Entrada');
  await canal._ingest(texto(EMP, 'Entrada'));
  paso('   ...comparte ubicación lejana', 'Juan', '📍 19.50, -99.20');
  await canal._ingest(ubic(EMP, 19.50, -99.20));

  paso('5. Consulta vacaciones', 'Juan', '¿Cuántas vacaciones me quedan?');
  await canal._ingest(texto(EMP, '¿Cuántas vacaciones me quedan?'));

  paso('6. Consulta horas extra', 'Juan', '¿Cuántas horas extra llevo?');
  await canal._ingest(texto(EMP, '¿Cuántas horas extra llevo?'));

  paso('7. Consulta nómina estimada', 'Juan', '¿Cuánto voy a cobrar esta semana?');
  await canal._ingest(texto(EMP, '¿Cuánto voy a cobrar esta semana?'));

  paso('8. Solicita un permiso', 'Juan', 'Necesito permiso el médico');
  await canal._ingest(texto(EMP, 'Necesito permiso el médico'));

  paso('9. El ADMIN revisa pendientes', 'Admin', 'pendientes');
  await canal._ingest(texto(ADMIN, 'pendientes'));

  paso('10. El ADMIN aprueba el permiso #1', 'Admin', 'aprobar permiso 1');
  await canal._ingest(texto(ADMIN, 'aprobar permiso 1'));

  paso('11. Reporta incapacidad', 'Juan', 'Tengo incapacidad de 3 días');
  await canal._ingest(texto(EMP, 'Tengo incapacidad de 3 días'));

  paso('12. Envía el comprobante (archivo)', 'Juan', '📎 comprobante.pdf');
  await canal._ingest(archivo(EMP, 'comprobante.pdf'));

  paso('13. Marca SALIDA', 'Juan', 'Ya me voy');
  await canal._ingest(texto(EMP, 'Ya me voy'));
  paso('   ...comparte ubicación en la obra', 'Juan', '📍 19.4326, -99.1332');
  await canal._ingest(ubic(EMP, 19.4326, -99.1332));

  console.log('\n✅ Simulación terminada. Revisa el panel para ver los registros.\n');
  await pool.end();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('❌ Error:', err);
  await pool.end();
  process.exit(1);
});
