<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const rows = ref([]);
async function cargar() { rows.value = await api.get('/incidencias'); }
const tipoLabel = {
  fuera_geocerca: '📍 Fuera de geocerca',
  retardo: '⏰ Retardo',
  salida_anticipada: '🏃 Salida anticipada',
  falta: '❌ Falta',
};
onMounted(cargar);
</script>

<template>
  <h2>Incidencias</h2>
  <table>
    <thead><tr><th>Empleado</th><th>Tipo</th><th>Descripción</th><th>Fecha</th><th>Estatus</th></tr></thead>
    <tbody>
      <tr v-for="i in rows" :key="i.id">
        <td>{{ i.empleado }}</td>
        <td>{{ tipoLabel[i.tipo] || i.tipo }}</td>
        <td>{{ i.descripcion }}</td>
        <td>{{ i.fecha?.slice(0,10) }}</td>
        <td><span class="badge" :class="i.resuelta ? 'aprobada' : 'pendiente'">{{ i.resuelta ? 'resuelta' : 'abierta' }}</span></td>
      </tr>
    </tbody>
  </table>
</template>
