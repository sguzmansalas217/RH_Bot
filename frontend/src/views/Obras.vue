<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const obras = ref([]);
const vacia = () => ({ tipo: 'obra', radio_metros: 100 });
const form = ref(vacia());
const editId = ref(null); // null = creando; con id = editando

async function cargar() { obras.value = await api.get('/obras'); }

function editar(o) {
  editId.value = o.id;
  form.value = { nombre: o.nombre, tipo: o.tipo, lat: o.lat, lon: o.lon, radio_metros: o.radio_metros };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cancelar() {
  editId.value = null;
  form.value = vacia();
}

async function guardar() {
  if (!form.value.nombre || !form.value.lat || !form.value.lon) return alert('Completa nombre, lat y lon');
  const payload = {
    nombre: form.value.nombre, tipo: form.value.tipo,
    lat: Number(form.value.lat), lon: Number(form.value.lon),
    radio_metros: Number(form.value.radio_metros),
  };
  if (editId.value) await api.put(`/obras/${editId.value}`, payload);
  else await api.post('/obras', payload);
  cancelar();
  await cargar();
}

async function eliminar(o) {
  if (!confirm(`¿Eliminar la obra "${o.nombre}"? Dejará de contar para asistencias.`)) return;
  await api.del(`/obras/${o.id}`);
  await cargar();
}

onMounted(cargar);
</script>

<template>
  <h2>Obras / Geocercas</h2>

  <div class="card" style="margin-bottom:20px">
    <h3>{{ editId ? '✏️ Editar ubicación' : 'Nueva ubicación autorizada' }}</h3>
    <div class="row">
      <div class="field" style="flex:2"><label>Nombre</label><input v-model="form.nombre" placeholder="Obra Centro" /></div>
      <div class="field"><label>Tipo</label>
        <select v-model="form.tipo"><option>obra</option><option>oficina</option><option>planta</option><option>sucursal</option></select>
      </div>
      <div class="field"><label>Latitud</label><input v-model="form.lat" placeholder="19.4326" /></div>
      <div class="field"><label>Longitud</label><input v-model="form.lon" placeholder="-99.1332" /></div>
      <div class="field"><label>Radio (m)</label><input type="number" v-model="form.radio_metros" /></div>
      <div class="field"><label>&nbsp;</label>
        <div class="row">
          <button @click="guardar">{{ editId ? 'Guardar' : 'Agregar' }}</button>
          <button v-if="editId" class="secondary" @click="cancelar">Cancelar</button>
        </div>
      </div>
    </div>
    <p style="color:var(--muted);font-size:13px">💡 Toma lat/lon desde Google Maps (clic derecho → coordenadas).</p>
  </div>

  <table>
    <thead><tr><th>Nombre</th><th>Tipo</th><th>Latitud</th><th>Longitud</th><th>Radio</th><th></th></tr></thead>
    <tbody>
      <tr v-for="o in obras" :key="o.id">
        <td>{{ o.nombre }}</td><td>{{ o.tipo }}</td>
        <td>{{ Number(o.lat).toFixed(5) }}</td><td>{{ Number(o.lon).toFixed(5) }}</td>
        <td>{{ o.radio_metros }} m</td>
        <td>
          <button @click="editar(o)">Editar</button>
          <button class="danger" @click="eliminar(o)">Eliminar</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
