import { logger } from '../config/logger.js';
import { setEstado, limpiarEstado } from '../services/state.js';
import {
  guardarProspecto, obtenerProspecto, listarProspectos, marcarContactado, numerosDueno, clave,
} from '../services/prospectos.js';

/**
 * Atención a números DESCONOCIDOS (ni empleados ni administradores):
 * les ofrece Nexori RH, toma nombre / empresa / número de empleados,
 * avisa al dueño del sistema y después le reenvía lo que escriban.
 *
 * Estados (conversacion_estado.esperando):
 *   prospecto_menu → prospecto_nombre → prospecto_empresa → prospecto_empleados → prospecto_atendido
 */

const MENU =
  `1️⃣ Quiero una *demo / prueba gratis*\n` +
  `2️⃣ *Precios* y promoción\n` +
  `3️⃣ ¿*Cómo funciona*?\n` +
  `4️⃣ Soy *empleado* de una empresa que usa Nexori RH`;

const BIENVENIDA =
  `👋 ¡Hola! Gracias por escribir a *Nexori RH*.\n\n` +
  `Somos un sistema para que tus empleados registren su *asistencia por WhatsApp* con ubicación, ` +
  `y tú veas asistencias, permisos, vacaciones y prenómina en un solo panel.\n\n` +
  `¿En qué te ayudo? Responde con el número:\n${MENU}`;

const COMO_FUNCIONA =
  `Es muy sencillo 👇\n\n` +
  `1️⃣ El trabajador escribe *"Llegué"* a este WhatsApp.\n` +
  `2️⃣ Comparte su ubicación y el sistema valida que esté en la obra o sucursal (geocerca), con la hora oficial del servidor.\n` +
  `3️⃣ Tú ves entradas, retardos, faltas, permisos y vacaciones en tu panel, listos para la prenómina.\n\n` +
  `No instalan nada: solo usan WhatsApp. 📱\n\n` +
  `¿Te muestro una *demo gratis* de 15 minutos? Responde *1*.`;

const PRECIO =
  `💰 El precio depende del número de empleados, y te preparo una cotización exacta.\n\n` +
  `🎉 Además, las *primeras 10 empresas* tienen *50% de descuento el primer mes*.\n\n` +
  `Para cotizarte necesito 3 datos rápidos. ¿Cómo te llamas?`;

const EMPLEADO = (num) =>
  `👷 Este es el WhatsApp de asistencia de Nexori RH, pero tu número todavía *no está registrado*.\n\n` +
  `Pide a Recursos Humanos de tu empresa que te den de alta con este número: *${num}*. ` +
  `En cuanto lo hagan, podrás registrar tu entrada escribiendo *Llegué*.`;

// Quita acentos y pasa a minúsculas para comparar palabras clave.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Detecta qué quiere el prospecto, por número de opción o por palabras.
function detectarOpcion(texto) {
  const t = norm(texto);
  if (/^4\b/.test(t) || /\b(soy empleado|trabajo en|trabajador|llegue|entrada|salida|ya me voy|permiso|vacaciones|incapacidad|checar)\b/.test(t)) return 'empleado';
  if (/^2\b/.test(t) || /\b(precio|precios|costo|cuesta|cuanto|tarifa|cotiza|cotizacion)\b/.test(t)) return 'precio';
  if (/^3\b/.test(t) || /\b(funciona|como es|informacion|info|detalles)\b/.test(t)) return 'funciona';
  if (/^1\b/.test(t) || /\b(demo|demostracion|prueba|probar|promo|promocion|50|descuento|contratar|agendar|interesa|quiero)\b/.test(t)) return 'demo';
  return null;
}

// Número legible: 10 dígitos con espacios (449 123 4567)
const legible = (n) => {
  const d = clave(n);
  return /^\d{10}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
};
const linkWa = (n) => {
  const d = clave(n);
  return /^\d{10}$/.test(d) ? `https://wa.me/52${d}` : '(sin número visible)';
};

/** Avisa a los números del dueño del sistema. */
async function avisarDueno(channel, texto) {
  const propio = clave(channel.numero?.() || '');
  const destinos = (await numerosDueno()).filter((n) => clave(n) !== propio);
  if (!destinos.length) logger.warn('Prospecto nuevo pero no hay ADMIN_WHATSAPP (distinto al del bot) para avisar');
  for (const n of destinos) {
    try {
      await channel.sendText(n, texto);
    } catch (err) {
      logger.error({ err, n }, 'No se pudo avisar al dueño del prospecto');
    }
  }
}

/** Mensajes de un número desconocido. */
export async function manejarProspecto(msg, estado, responder, channel) {
  const { from } = msg;
  const texto = (msg.text || '').trim();
  const st = estado?.esperando?.startsWith('prospecto_') ? estado.esperando : null;
  const ctx = (st && estado.contexto) || {};

  // Ubicaciones / archivos de alguien no registrado: casi siempre un empleado nuevo.
  if (msg.type !== 'texto') {
    if (st === 'prospecto_atendido') return reenviarAlDueno(msg, '(envió un archivo o ubicación)', channel);
    return responder(from, EMPLEADO(legible(from)));
  }

  // ── Captura de datos para la demo ──
  if (st === 'prospecto_nombre') {
    ctx.nombre = texto.slice(0, 80);
    await setEstado(from, 'prospecto_empresa', ctx);
    return responder(from, `Mucho gusto, *${ctx.nombre.split(' ')[0]}* 🙌\n¿Cómo se llama tu *empresa*?`);
  }
  if (st === 'prospecto_empresa') {
    ctx.empresa = texto.slice(0, 120);
    await setEstado(from, 'prospecto_empleados', ctx);
    return responder(from, `¿Cuántos *empleados* tienen aproximadamente? (solo el número, ej. *25*)`);
  }
  if (st === 'prospecto_empleados') {
    const n = parseInt(texto.replace(/\D/g, ''), 10);
    ctx.empleados = Number.isFinite(n) ? n : null;
    const p = await guardarProspecto(from, ctx);
    await setEstado(from, 'prospecto_atendido', { ...ctx, avisado: Date.now() });

    await avisarDueno(
      channel,
      `🆕 *Nuevo cliente interesado — quiere ${p.interes === 'precio' ? 'cotización' : 'demo / prueba'}*\n\n` +
        `👤 ${p.nombre || '—'}\n🏢 ${p.empresa || '—'}\n👥 ${p.empleados ?? texto} empleados\n` +
        `📲 ${legible(from)}\n` +
        (p.primer_mensaje ? `💬 Primer mensaje: "${p.primer_mensaje}"\n` : '') +
        `\n👉 Escríbele por WhatsApp para comenzar la prueba:\n${linkWa(from)}`
    );
    return responder(
      from,
      `✅ ¡Gracias, ${(p.nombre || '').split(' ')[0] || 'listo'}! Ya tengo tus datos.\n\n` +
        `👨‍💼 *Un operador se pondrá en contacto contigo* por WhatsApp para hacer la prueba de Nexori RH ` +
        `con tu empresa y enviarte tu cotización. 🙌`
    );
  }

  // ── Ya dejó sus datos: lo que escriba se le reenvía al dueño ──
  if (st === 'prospecto_atendido') {
    if (norm(texto) === 'menu') {
      await setEstado(from, 'prospecto_menu', ctx);
      return responder(from, MENU);
    }
    await reenviarAlDueno(msg, texto, channel);
    // Acuse de recibo como máximo cada 6 horas, para no contestar cada mensaje.
    if (!ctx.avisado || Date.now() - ctx.avisado > 6 * 3600 * 1000) {
      await setEstado(from, 'prospecto_atendido', { ...ctx, avisado: Date.now() });
      return responder(from, '📩 Recibí tu mensaje, en breve te respondemos por aquí.');
    }
    return;
  }

  // ── Menú / primer contacto ──
  const opcion = detectarOpcion(texto);
  const prospecto = await obtenerProspecto(from);
  if (!prospecto) await guardarProspecto(from, { primer_mensaje: texto.slice(0, 300) });

  switch (opcion) {
    case 'empleado':
      await limpiarEstado(from);
      return responder(from, EMPLEADO(legible(from)));

    case 'funciona':
      await setEstado(from, 'prospecto_menu', ctx);
      return responder(from, COMO_FUNCIONA);

    case 'precio':
      await guardarProspecto(from, { interes: 'precio' });
      await setEstado(from, 'prospecto_nombre', { ...ctx, interes: 'precio' });
      return responder(from, PRECIO);

    case 'demo': {
      const promo = /promo|50|descuento/.test(norm(texto));
      const interes = promo ? 'promocion' : 'demo';
      await guardarProspecto(from, { interes });
      await setEstado(from, 'prospecto_nombre', { ...ctx, interes });
      return responder(
        from,
        (promo
          ? `🎉 ¡Claro! Las primeras 10 empresas tienen *50% de descuento el primer mes*.\n\n`
          : `🙌 ¡Con gusto! Un operador te contactará para hacer la *prueba gratis* con tu empresa.\n\n`) +
          `Solo necesito 3 datos rápidos. ¿Cómo te llamas?`
      );
    }

    default:
      await setEstado(from, 'prospecto_menu', ctx);
      return responder(from, st === 'prospecto_menu' ? `No te entendí 🙂 Responde con el número:\n${MENU}` : BIENVENIDA);
  }
}

async function reenviarAlDueno(msg, texto, channel) {
  const p = await obtenerProspecto(msg.from);
  await avisarDueno(
    channel,
    `💬 *${p?.nombre || legible(msg.from)}*${p?.empresa ? ` (${p.empresa})` : ''} escribió:\n${texto}\n\n` +
      `Responde: *r ${clave(msg.from)} tu mensaje*`
  );
}

/**
 * Comandos del dueño del sistema por WhatsApp (devuelve true si lo manejó):
 *   r <número> <mensaje>  → le contesta al prospecto desde el número del bot
 *   prospectos            → últimos prospectos nuevos
 */
export async function manejarComandoDueno(from, texto, responder, channel) {
  const t = (texto || '').trim();

  const m = t.match(/^r\s+(\+?[\d\s-]{10,16})\s+([\s\S]+)$/i);
  if (m) {
    const num = clave(m[1]);
    if (!/^\d{10}$/.test(num)) {
      await responder(from, '⚠️ Número inválido. Usa: *r 4491234567 tu mensaje*');
      return true;
    }
    // Se contesta al número tal como llegó (formato exacto de WhatsApp); si no es prospecto, 521 + 10 dígitos.
    const p = await obtenerProspecto(num);
    await channel.sendText(p?.wa_raw || `521${num}`, m[2].trim());
    await marcarContactado(num);
    await responder(from, `✅ Enviado a ${legible(num)}.`);
    return true;
  }

  if (norm(t) === 'prospectos') {
    const lista = (await listarProspectos()).filter((p) => p.estatus === 'nuevo').slice(0, 10);
    if (!lista.length) {
      await responder(from, '✅ No hay prospectos nuevos.');
      return true;
    }
    const txt = lista
      .map((p) => `• ${p.nombre || '—'} · ${p.empresa || '—'} · ${p.empleados ?? '?'} emp. · ${legible(p.whatsapp)}`)
      .join('\n');
    await responder(from, `🆕 *Prospectos nuevos:*\n${txt}\n\nResponde: *r <número> tu mensaje*`);
    return true;
  }
  return false;
}
