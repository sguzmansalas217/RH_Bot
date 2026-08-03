<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '../api.js';

const lista = ref([]);
const desde = ref(new Date().toISOString().slice(0, 10));
const hasta = ref(new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10));

const icono = { vacaciones: '🏖️', permiso: '📝', incapacidad: '🤒' };

async function cargar() {
  lista.value = await api.get(`/ausencias?desde=${desde.value}&hasta=${hasta.value}`);
}

function fecha(f) {
  if (!f) return '';
  const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function rango(a) {
  if (a.fecha_fin && String(a.fecha_fin).slice(0, 10) !== String(a.fecha_inicio).slice(0, 10))
    return `${fecha(a.fecha_inicio)} → ${fecha(a.fecha_fin)}`;
  return fecha(a.fecha_inicio);
}
// ¿está ausente HOY?
function activaHoy(a) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ini = String(a.fecha_inicio).slice(0, 10);
  const fin = String(a.fecha_fin || a.fecha_inicio).slice(0, 10);
  return ini <= hoy && hoy <= fin;
}

const hoyCount = computed(() => lista.value.filter(activaHoy).length);
</script>

<template>
  <div class="toolbar">
    <h2>Ausencias (vacaciones / permisos / incapacidades)</h2>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="row" style="align-items:flex-end">
      <div class="field"><label>Desde</label><input type="date" v-model="desde" /></div>
      <div class="field"><label>Hasta</label><input type="date" v-model="hasta" /></div>
      <div class="field"><label>&nbsp;</label><button @click="cargar">Ver</button></div>
    </div>
    <p style="color:var(--muted);font-size:13px;margin:8px 0 0">
      Ausentes <strong>hoy</strong>: {{ hoyCount }} · Total en el rango: {{ lista.length }}
    </p>
  </div>

  <p v-if="!lista.length" style="color:var(--muted)">Nadie ausente en este rango 🎉</p>
  <table v-else>
    <thead><tr><th>Tipo</th><th>Empleado</th><th>Fechas</th><th>Días</th><th>Hoy</th></tr></thead>
    <tbody>
      <tr v-for="(a, i) in lista" :key="i">
        <td>{{ icono[a.tipo] }} {{ a.tipo }}</td>
        <td>{{ a.empleado }}</td>
        <td>{{ rango(a) }}</td>
        <td>{{ a.dias || '—' }}</td>
        <td>{{ activaHoy(a) ? '🟢 Ausente' : '—' }}</td>
      </tr>
    </tbody>
  </table>
</template>
