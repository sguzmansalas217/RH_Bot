<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const obras = ref([]);
const form = ref({ tipo: 'obra', radio_metros: 100 });

async function cargar() { obras.value = await api.get('/obras'); }
async function crear() {
  if (!form.value.nombre || !form.value.lat || !form.value.lon) return alert('Completa nombre, lat y lon');
  await api.post('/obras', {
    nombre: form.value.nombre, tipo: form.value.tipo,
    lat: Number(form.value.lat), lon: Number(form.value.lon),
    radio_metros: Number(form.value.radio_metros),
  });
  form.value = { tipo: 'obra', radio_metros: 100 };
  await cargar();
}
onMounted(cargar);
</script>

<template>
  <h2>Obras / Geocercas</h2>

  <div class="card" style="margin-bottom:20px">
    <h3>Nueva ubicación autorizada</h3>
    <div class="row">
      <div class="field" style="flex:2"><label>Nombre</label><input v-model="form.nombre" placeholder="Obra Centro" /></div>
      <div class="field"><label>Tipo</label>
        <select v-model="form.tipo"><option>obra</option><option>oficina</option><option>planta</option><option>sucursal</option></select>
      </div>
      <div class="field"><label>Latitud</label><input v-model="form.lat" placeholder="19.4326" /></div>
      <div class="field"><label>Longitud</label><input v-model="form.lon" placeholder="-99.1332" /></div>
      <div class="field"><label>Radio (m)</label><input type="number" v-model="form.radio_metros" /></div>
      <div class="field"><button @click="crear">Agregar</button></div>
    </div>
    <p style="color:var(--muted);font-size:13px">💡 Toma lat/lon desde Google Maps (clic derecho → coordenadas).</p>
  </div>

  <table>
    <thead><tr><th>Nombre</th><th>Tipo</th><th>Latitud</th><th>Longitud</th><th>Radio</th><th>Activa</th></tr></thead>
    <tbody>
      <tr v-for="o in obras" :key="o.id">
        <td>{{ o.nombre }}</td><td>{{ o.tipo }}</td>
        <td>{{ Number(o.lat).toFixed(5) }}</td><td>{{ Number(o.lon).toFixed(5) }}</td>
        <td>{{ o.radio_metros }} m</td><td>{{ o.activa ? '✅' : '—' }}</td>
      </tr>
    </tbody>
  </table>
</template>
