<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const pendientes = ref([]);
const estatusAprobar = { permiso: 'aprobado', vacacion: 'aprobada', incapacidad: 'aprobada' };
const estatusRechazar = { permiso: 'rechazado', vacacion: 'rechazada', incapacidad: 'rechazada' };
const nombreTipo = { permiso: 'Permiso', vacacion: 'Vacaciones', incapacidad: 'Incapacidad' };

async function cargar() { pendientes.value = await api.get('/pendientes'); }

// "2026-08-03..." → "3 ago 2026"
function fecha(f) {
  if (!f) return '';
  const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function rango(s) {
  if (s.fecha_inicio && s.fecha_fin && String(s.fecha_fin).slice(0, 10) !== String(s.fecha_inicio).slice(0, 10))
    return `${fecha(s.fecha_inicio)} → ${fecha(s.fecha_fin)}`;
  return fecha(s.fecha_inicio);
}
// Texto de "qué está pidiendo"
function detalle(s) {
  const p = [];
  if (s.tipo_solicitud === 'vacacion') { if (s.dias) p.push(`${s.dias} día(s)`); }
  else if (s.tipo_solicitud === 'permiso') {
    if (s.subtipo && s.subtipo !== 'permiso') p.push(s.subtipo.replace('_', ' '));
    if (s.horas) p.push(`${s.horas} h`);
    if (s.motivo) p.push(`"${s.motivo}"`);
  } else if (s.tipo_solicitud === 'incapacidad') {
    if (s.subtipo) p.push(s.subtipo);
    if (s.dias) p.push(`${s.dias} día(s)`);
    if (s.motivo) p.push(`folio ${s.motivo}`);
  }
  const r = rango(s);
  return [r, p.join(' · ')].filter(Boolean).join(' — ');
}

async function resolver(s, aprobar) {
  if (aprobar && s.empalmes?.length) {
    const quienes = s.empalmes
      .map((e) => `• ${e.nombre} (${e.tipo}) ${fecha(e.inicio)}${e.fin ? '–' + fecha(e.fin) : ''}`)
      .join('\n');
    if (!confirm(`⚠️ EMPALME DE FECHAS\n\nEn esas fechas ya está(n) ausente(s):\n${quienes}\n\n¿Aprobar de todos modos?`)) return;
  }
  const estatus = aprobar ? estatusAprobar[s.tipo_solicitud] : estatusRechazar[s.tipo_solicitud];
  await api.post(`/solicitudes/${s.tipo_solicitud}/${s.id}/resolver`, { estatus });
  await cargar();
}
onMounted(cargar);
</script>

<template>
  <h2>Aprobaciones pendientes</h2>
  <p v-if="!pendientes.length" style="color:var(--muted)">No hay solicitudes pendientes 🎉</p>
  <table v-else>
    <thead><tr><th>Tipo</th><th>Empleado</th><th>Qué pide</th><th>Alerta</th><th></th></tr></thead>
    <tbody>
      <tr v-for="s in pendientes" :key="s.tipo_solicitud + s.id">
        <td><strong>{{ nombreTipo[s.tipo_solicitud] }}</strong></td>
        <td>{{ s.empleado }}<br><span style="color:var(--muted);font-size:12px">{{ s.whatsapp }}</span></td>
        <td>{{ detalle(s) }}</td>
        <td>
          <span v-if="s.empalmes?.length" class="badge-warn" :title="s.empalmes.map(e => e.nombre).join(', ')">
            ⚠️ {{ s.empalmes.length }} empalme(s)
          </span>
          <span v-else style="color:var(--muted)">—</span>
        </td>
        <td>
          <button @click="resolver(s, true)">Aprobar</button>
          <button class="danger" @click="resolver(s, false)">Rechazar</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.badge-warn {
  background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;
  padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap;
}
</style>
