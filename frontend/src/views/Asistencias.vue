<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const hoy = new Date().toISOString().slice(0, 10);
const semanaAtras = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
const desde = ref(semanaAtras);
const hasta = ref(hoy);
const rows = ref([]);

async function cargar() {
  rows.value = await api.get(`/asistencias?desde=${desde.value}&hasta=${hasta.value}`);
}
const fmt = (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—');
function exportar() {
  api.download(`/reportes/asistencia.xlsx?desde=${desde.value}&hasta=${hasta.value}`);
}
onMounted(cargar);
</script>

<template>
  <h2>Asistencias</h2>
  <div class="row" style="margin-bottom:16px">
    <div class="field"><label>Desde</label><input type="date" v-model="desde" /></div>
    <div class="field"><label>Hasta</label><input type="date" v-model="hasta" /></div>
    <div class="field"><button @click="cargar">Filtrar</button></div>
    <div class="field"><button class="ghost" @click="exportar">⬇️ Exportar Excel</button></div>
  </div>

  <table>
    <thead>
      <tr><th>Empleado</th><th>Fecha</th><th>Obra</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Extra</th><th>Retardo</th><th>Estatus</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id">
        <td>{{ r.empleado }}</td><td>{{ r.fecha?.slice(0,10) }}</td><td>{{ r.obra || '—' }}</td>
        <td>{{ fmt(r.entrada) }}</td><td>{{ fmt(r.salida) }}</td>
        <td>{{ r.horas_trabajadas }}</td><td>{{ r.horas_extra }}</td><td>{{ r.minutos_retardo }} min</td>
        <td><span class="badge" :class="r.estatus">{{ r.estatus }}</span></td>
      </tr>
    </tbody>
  </table>
</template>
