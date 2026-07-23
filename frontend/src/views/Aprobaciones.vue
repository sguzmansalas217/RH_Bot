<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const pendientes = ref([]);
const estatusAprobar = { permiso: 'aprobado', vacacion: 'aprobada', incapacidad: 'aprobada' };
const estatusRechazar = { permiso: 'rechazado', vacacion: 'rechazada', incapacidad: 'rechazada' };

async function cargar() { pendientes.value = await api.get('/pendientes'); }
async function resolver(s, aprobar) {
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
    <thead><tr><th>#</th><th>Tipo</th><th>Empleado</th><th>WhatsApp</th><th>Fecha</th><th></th></tr></thead>
    <tbody>
      <tr v-for="s in pendientes" :key="s.tipo_solicitud + s.id">
        <td>{{ s.id }}</td>
        <td>{{ s.tipo_solicitud }}</td>
        <td>{{ s.empleado }}</td>
        <td>{{ s.whatsapp }}</td>
        <td>{{ new Date(s.creado_en).toLocaleDateString('es-MX') }}</td>
        <td>
          <button @click="resolver(s, true)">Aprobar</button>
          <button class="danger" @click="resolver(s, false)">Rechazar</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
