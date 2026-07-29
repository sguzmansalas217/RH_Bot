import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { query } from '../db/pool.js';
import { analizarIntencion } from '../ai/intent.js';
import { buscarPorWhatsapp } from '../services/employees.js';
import { getEstado, setEstado, limpiarEstado } from '../services/state.js';
import { registrarEntrada, registrarSalida, horasExtraSemana, resumenTrabajo } from '../services/attendance.js';
import {
  solicitarPermiso,
  solicitarVacaciones,
  consultarVacaciones,
  reportarIncapacidad,
  incapacidadPendienteComprobante,
  adjuntarComprobante,
  consultarEstatus,
} from '../services/leaves.js';
import { estimarSemana } from '../services/payroll/index.js';
import { one } from '../db/pool.js';
import { guardarArchivo } from '../services/files.js';
import { manejarComandoAdmin } from './admin-commands.js';

const MENU = `👋 Soy tu asistente de RH. Puedes escribirme naturalmente, por ejemplo:
• *Llegué* / *Entrada* — marcar entrada
• *Ya me voy* / *Salida* — marcar salida
• *Necesito permiso mañana*
• *¿Cuántas vacaciones me quedan?*
• *Quiero vacaciones del 5 al 10 de agosto*
• *Tengo incapacidad*
• *¿Cuánto voy a cobrar esta semana?*
• *¿Cuántas horas extra llevo?*
• *¿Cuántas horas trabajé del 1 al 15?*
• *¿Ya aprobaron mi permiso?*`;

async function logMensaje(whatsapp, empleadoId, direccion, texto, intencion, entidades, tipo) {
  await query(
    `INSERT INTO mensajes_wa (whatsapp, empleado_id, direccion, texto, intencion, entidades, tipo_mensaje)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [whatsapp, empleadoId, direccion, texto, intencion, entidades ? JSON.stringify(entidades) : null, tipo]
  );
}

export function crearRouter(channel) {
  const responder = async (to, texto) => {
    await channel.sendText(to, texto);
    await logMensaje(to, null, 'saliente', texto, null, null, 'texto');
  };

  async function manejar(msg) {
    const { from } = msg;
    logger.debug({ from, type: msg.type }, 'Mensaje entrante');

    // ¿Es administrador aprobando/consultando por WhatsApp?
    if (config.whatsapp.admins.includes(from) && msg.type === 'texto') {
      const manejado = await manejarComandoAdmin(from, msg.text, responder, channel);
      if (manejado) return;
    }

    const empleado = await buscarPorWhatsapp(from);
    if (!empleado) {
      await logMensaje(from, null, 'entrante', msg.text, null, null, msg.type);
      return responder(
        from,
        '⚠️ Tu número no está registrado como empleado. Contacta a Recursos Humanos.'
      );
    }

    const estado = await getEstado(from);

    // ─── Mensajes de UBICACIÓN (flujo entrada/salida) ───
    if (msg.type === 'ubicacion') {
      await logMensaje(from, empleado.id, 'entrante', 'ubicación', null, msg.location, 'ubicacion');
      return manejarUbicacion(empleado, estado, msg.location, responder);
    }

    // ─── ARCHIVOS (comprobante de incapacidad) ───
    if (msg.type === 'archivo') {
      await logMensaje(from, empleado.id, 'entrante', msg.text || 'archivo', null, null, 'archivo');
      return manejarArchivo(empleado, estado, msg, responder);
    }

    // ─── TEXTO → IA ───
    const ia = await analizarIntencion(msg.text, { hoy: new Date().toISOString().slice(0, 10) });
    await logMensaje(from, empleado.id, 'entrante', msg.text, ia.intencion, ia.entidades, 'texto');

    // Si estábamos esperando un rango de fechas para el reporte de horas
    if (estado?.esperando === 'rango_horas') {
      await limpiarEstado(from);
      return responderHorasTrabajadas(empleado, ia.entidades || {}, responder);
    }

    return dispatch(empleado, ia, responder);
  }

  // Reporte de horas/días trabajados en un rango de fechas
  async function responderHorasTrabajadas(empleado, ent, responder) {
    const to = empleado.whatsapp;
    if (!ent.fecha_inicio || !ent.fecha_fin) {
      return responder(to, '❌ No entendí las fechas. Escribe algo como: *"del 1 al 15 de julio"*.');
    }
    const r = await resumenTrabajo(empleado.id, ent.fecha_inicio, ent.fecha_fin);
    return responder(
      to,
      `📊 *Del ${fechaCorta(ent.fecha_inicio)} al ${fechaCorta(ent.fecha_fin)}:*\n` +
        `• Días trabajados: *${r.dias}*\n` +
        `• Horas normales: *${r.horas_normales}*\n` +
        `• Horas extra: *${r.horas_extra}*\n` +
        `• Total de horas: *${r.horas_totales}*`
    );
  }

  // ─────────────────────────────────────────────────────────────────
  async function dispatch(empleado, ia, responder) {
    const to = empleado.whatsapp;
    const ent = ia.entidades || {};

    switch (ia.intencion) {
      case 'entrada':
        await setEstado(to, 'ubicacion_entrada');
        return channel.requestLocation(to, '📍 Registrando tu *entrada*.');

      case 'salida':
        await setEstado(to, 'ubicacion_salida');
        return channel.requestLocation(to, '📍 Registrando tu *salida*.');

      case 'solicitar_permiso': {
        const p = await solicitarPermiso(empleado, ent);
        const f = fechaCorta(p.fecha_inicio);
        await notificarAdmins(
          `🔔 *Nuevo permiso* #${p.id}\n${empleado.nombre}\nMotivo: ${p.motivo || '—'}\nFecha: ${f}\nResponde: *aprobar permiso ${p.id}* o *rechazar permiso ${p.id}*`
        );
        return responder(
          to,
          `✅ Registré tu solicitud de permiso para *${f}*. Queda *pendiente* de autorización. Te aviso cuando haya respuesta.`
        );
      }

      case 'solicitar_vacaciones': {
        if (!ent.fecha_inicio) {
          return responder(to, '📅 ¿Del qué día al qué día quieres tus vacaciones? Ej: "del 5 al 10 de agosto".');
        }
        const r = await solicitarVacaciones(empleado, ent);
        if (!r.ok) {
          return responder(
            to,
            `⚠️ No tienes saldo suficiente. Solicitaste *${r.dias}* días y tu saldo es *${r.saldo}*.`
          );
        }
        await notificarAdmins(
          `🔔 *Vacaciones* #${r.solicitud.id}\n${empleado.nombre}\n${r.solicitud.fecha_inicio} → ${r.solicitud.fecha_fin} (${r.dias} días)\nResponde: *aprobar vacacion ${r.solicitud.id}* o *rechazar vacacion ${r.solicitud.id}*`
        );
        return responder(to, `✅ Solicité *${r.dias}* días de vacaciones. Pendiente de autorización.`);
      }

      case 'consultar_vacaciones': {
        const v = await consultarVacaciones(empleado);
        let txt = `🏖️ Tienes *${v.saldo}* días de vacaciones disponibles.`;
        const aprobadas = (v.historial || []).filter((h) => h.estatus === 'aprobada');
        const pendientes = (v.historial || []).filter((h) => h.estatus === 'pendiente');
        if (aprobadas.length) {
          txt += `\n\n✅ *Autorizadas:*`;
          for (const h of aprobadas) {
            txt += `\n• ${fechaCorta(h.fecha_inicio)} al ${fechaCorta(h.fecha_fin)} (${h.dias} días)`;
          }
        }
        if (pendientes.length) {
          txt += `\n\n⏳ *Pendientes de autorizar:*`;
          for (const h of pendientes) {
            txt += `\n• ${fechaCorta(h.fecha_inicio)} al ${fechaCorta(h.fecha_fin)} (${h.dias} días)`;
          }
        }
        return responder(to, txt);
      }

      case 'reportar_incapacidad': {
        const inc = await reportarIncapacidad(empleado, ent);
        await setEstado(to, 'comprobante', { incapacidadId: inc.id });
        return responder(
          to,
          `🩺 Registré tu incapacidad. Por favor *envía la foto o PDF del comprobante médico* en el siguiente mensaje.`
        );
      }

      case 'consultar_incapacidad': {
        const e = await consultarEstatus(empleado.id);
        return responder(
          to,
          e.incapacidad
            ? `🩺 Tu última incapacidad (${e.incapacidad.tipo}) está: *${e.incapacidad.estatus}*.`
            : 'No tienes incapacidades registradas.'
        );
      }

      case 'consultar_nomina': {
        const empresa = await one(`SELECT * FROM empresas WHERE id=$1`, [empleado.empresa_id]);
        const est = await estimarSemana(empleado, empresa);
        return responder(
          to,
          `💰 Estimado de esta semana:\n• Días trabajados: ${est.dias}\n• Horas extra: ${est.horas_extra}\n• Bruto: $${est.bruto}\n• ISR: $${est.isr}\n• *Neto estimado: $${est.estimado_neto}*\n_Es una estimación; el recibo final lo calcula RH._`
        );
      }

      case 'consultar_horas_extra': {
        const he = await horasExtraSemana(empleado.id);
        return responder(to, `⏱️ Llevas *${he}* horas extra esta semana.`);
      }

      case 'consultar_horas_trabajadas': {
        // Si ya dieron el rango, responde directo; si no, lo pedimos
        if (ent.fecha_inicio && ent.fecha_fin) {
          return responderHorasTrabajadas(empleado, ent, responder);
        }
        await setEstado(to, 'rango_horas');
        return responder(
          to,
          '📅 Con gusto. ¿De qué fecha a qué fecha quieres el reporte de horas? Ej: *"del 1 al 15 de julio"*.'
        );
      }

      case 'consultar_estatus_solicitud': {
        const e = await consultarEstatus(empleado.id);
        const partes = [];
        if (e.permiso) partes.push(`• Permiso (${fechaCorta(e.permiso.fecha_inicio)}): *${e.permiso.estatus}*`);
        if (e.vacacion) partes.push(`• Vacaciones (${fechaCorta(e.vacacion.fecha_inicio)} al ${fechaCorta(e.vacacion.fecha_fin)}, ${e.vacacion.dias} días): *${e.vacacion.estatus}*`);
        if (e.incapacidad) partes.push(`• Incapacidad: *${e.incapacidad.estatus}*`);
        return responder(to, partes.length ? partes.join('\n') : 'No tienes solicitudes recientes.');
      }

      case 'saludo':
      case 'ayuda':
        return responder(to, `Hola ${empleado.nombre.split(' ')[0]} 👋\n\n${MENU}`);

      default:
        return responder(
          to,
          ia.respuesta_sugerida || `No entendí bien 🤔.\n\n${MENU}`
        );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  async function manejarUbicacion(empleado, estado, location, responder) {
    const to = empleado.whatsapp;
    const { lat, lon } = location;

    if (estado?.esperando === 'ubicacion_entrada') {
      const r = await registrarEntrada(empleado, lat, lon);
      await limpiarEstado(to);
      if (!r.ok) return responder(to, mensajeErrorAsistencia(r, 'entrada'));
      const hora = new Date(r.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      let txt = `✅ *Entrada registrada* a las ${hora} en ${r.obra_nombre}.`;
      if (r.retardo_min > 0) txt += `\n⚠️ Retardo de ${r.retardo_min} min.`;
      return responder(to, txt);
    }

    if (estado?.esperando === 'ubicacion_salida') {
      const r = await registrarSalida(empleado, lat, lon);
      await limpiarEstado(to);
      if (!r.ok) return responder(to, mensajeErrorAsistencia(r, 'salida'));
      const hora = new Date(r.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      let txt = `✅ *Salida registrada* a las ${hora}.\n• Horas trabajadas: ${r.horas_trabajadas}\n• Horas extra: ${r.horas_extra}`;
      if (r.salida_anticipada_min > 0) txt += `\n⚠️ Salida anticipada de ${r.salida_anticipada_min} min.`;
      return responder(to, txt);
    }

    return responder(
      to,
      'Recibí tu ubicación, pero no esperaba una en este momento. Escribe *Entrada* o *Salida* primero.'
    );
  }

  async function manejarArchivo(empleado, estado, msg, responder) {
    const to = empleado.whatsapp;
    if (estado?.esperando !== 'comprobante') {
      return responder(to, 'Recibí tu archivo. Si es un comprobante de incapacidad, primero escribe *Tengo incapacidad*.');
    }
    const media = msg.downloadMedia ? await msg.downloadMedia() : null;
    if (!media) return responder(to, 'No pude descargar el archivo, inténtalo de nuevo.');

    const url = guardarArchivo(media.buffer, media.mimetype, `incap_${empleado.id}`);
    const incapId = estado.contexto?.incapacidadId
      || (await incapacidadPendienteComprobante(empleado.id))?.id;
    if (incapId) await adjuntarComprobante(incapId, url);
    await limpiarEstado(to);

    await notificarAdmins(
      `🔔 *Incapacidad con comprobante* #${incapId}\n${empleado.nombre}\nRevisa en el panel.\nResponde: *aprobar incapacidad ${incapId}* o *rechazar incapacidad ${incapId}*`
    );
    return responder(to, '📎 Recibí tu comprobante. Tu incapacidad quedó *pendiente* de revisión.');
  }

  async function notificarAdmins(texto) {
    for (const admin of config.whatsapp.admins) {
      try {
        await channel.sendText(admin, texto);
      } catch (err) {
        logger.error({ err, admin }, 'No se pudo notificar al admin');
      }
    }
  }

  return { manejar };
}

// Formatea una fecha (Date o string) como YYYY-MM-DD
function fechaCorta(f) {
  if (!f) return '—';
  return new Date(f).toISOString().slice(0, 10);
}

function mensajeErrorAsistencia(r, tipo) {
  switch (r.motivo) {
    case 'fuera_geocerca':
      return `❌ No puedo registrar tu ${tipo}: estás a *${r.distancia_m} m* de la obra (fuera del área permitida). Se generó una incidencia.`;
    case 'sin_obra':
      return '❌ No tienes una obra asignada. Contacta a RH.';
    case 'ya_registro_entrada':
      return 'ℹ️ Ya tenías una entrada registrada hoy.';
    case 'ya_registro_salida':
      return 'ℹ️ Ya registraste tu salida hoy.';
    case 'sin_entrada':
      return '❌ No tienes una entrada registrada hoy. Marca *Entrada* primero.';
    default:
      return '❌ No pude registrar el movimiento. Intenta de nuevo.';
  }
}
