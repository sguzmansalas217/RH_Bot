import { one } from '../db/pool.js';
import { resolver, pendientes } from '../services/leaves.js';

const TIPOS = { permiso: 'permiso', permisos: 'permiso', vacacion: 'vacacion', vacaciones: 'vacacion', incapacidad: 'incapacidad', incapacidades: 'incapacidad' };
const ESTATUS_APROBADO = { permiso: 'aprobado', vacacion: 'aprobada', incapacidad: 'aprobada' };
const ESTATUS_RECHAZADO = { permiso: 'rechazado', vacacion: 'rechazada', incapacidad: 'rechazada' };

/**
 * Comandos del administrador vía WhatsApp:
 *   aprobar <tipo> <id>
 *   rechazar <tipo> <id>
 *   pendientes
 * Recibe el `admin` (usuarios_admin) ya identificado por su WhatsApp; todas las
 * operaciones se limitan a la empresa de ese admin (admin.empresa_id).
 * Devuelve true si el mensaje fue un comando de admin (ya manejado).
 */
export async function manejarComandoAdmin(admin, from, texto, responder, channel) {
  const t = texto.trim().toLowerCase();

  if (t === 'pendientes' || t === 'solicitudes') {
    const lista = await pendientes(admin.empresa_id);
    if (!lista.length) {
      await responder(from, '✅ No hay solicitudes pendientes.');
      return true;
    }
    const msg = lista
      .map((s) => `#${s.id} ${s.tipo_solicitud} — ${s.empleado} (${s.estatus})`)
      .join('\n');
    await responder(from, `📋 *Pendientes:*\n${msg}\n\nResponde: *aprobar <tipo> <id>*`);
    return true;
  }

  const m = t.match(/^(aprobar|rechazar)\s+(permiso|permisos|vacacion|vacaciones|incapacidad|incapacidades)\s+#?(\d+)/);
  if (!m) return false;

  const accion = m[1];
  const tipo = TIPOS[m[2]];
  const id = parseInt(m[3], 10);

  const estatus = accion === 'aprobar' ? ESTATUS_APROBADO[tipo] : ESTATUS_RECHAZADO[tipo];

  // La guardia empresaId impide aprobar solicitudes de otra empresa.
  const solicitud = await resolver(tipo, id, {
    estatus,
    adminId: admin.id,
    empresaId: admin.empresa_id,
  });
  if (!solicitud) {
    await responder(from, `⚠️ No encontré la solicitud ${tipo} #${id} en tu empresa.`);
    return true;
  }

  await responder(from, `✅ ${tipo} #${id} marcada como *${estatus}*.`);

  // Notifica al empleado
  const emp = await one(`SELECT nombre, whatsapp FROM empleados WHERE id=$1`, [solicitud.empleado_id]);
  if (emp && channel) {
    const emoji = accion === 'aprobar' ? '✅' : '❌';
    await channel.sendText(
      emp.whatsapp,
      `${emoji} Tu solicitud de ${tipo} fue *${estatus}* por Recursos Humanos.`
    );
  }
  return true;
}
