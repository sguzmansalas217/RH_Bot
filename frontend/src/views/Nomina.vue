<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const periodos = ref([]);
const recibos = ref([]);
const seleccionado = ref(null);
const nuevo = ref({ tipo: 'semanal' });

async function cargar() { periodos.value = await api.get('/periodos'); }
async function crearPeriodo() {
  if (!nuevo.value.fecha_inicio || !nuevo.value.fecha_fin) return alert('Indica fechas');
  await api.post('/periodos', nuevo.value);
  nuevo.value = { tipo: 'semanal' };
  await cargar();
}
async function calcular(p) {
  await api.post(`/periodos/${p.id}/calcular`);
  await verRecibos(p);
  await cargar();
}
async function verRecibos(p) {
  seleccionado.value = p;
  recibos.value = await api.get(`/periodos/${p.id}/recibos`);
}
function descargarRecibo(r) { api.download(`/recibos/${r.id}.pdf`); }
onMounted(cargar);
</script>

<template>
  <h2>Nómina</h2>

  <div class="card" style="margin-bottom:20px">
    <h3>Nuevo periodo</h3>
    <div class="row">
      <div class="field"><label>Tipo</label>
        <select v-model="nuevo.tipo"><option>semanal</option><option>quincenal</option></select>
      </div>
      <div class="field"><label>Inicio</label><input type="date" v-model="nuevo.fecha_inicio" /></div>
      <div class="field"><label>Fin</label><input type="date" v-model="nuevo.fecha_fin" /></div>
      <div class="field"><button @click="crearPeriodo">Crear periodo</button></div>
    </div>
  </div>

  <table style="margin-bottom:24px">
    <thead><tr><th>Periodo</th><th>Tipo</th><th>Estatus</th><th></th></tr></thead>
    <tbody>
      <tr v-for="p in periodos" :key="p.id">
        <td>{{ p.fecha_inicio?.slice(0,10) }} → {{ p.fecha_fin?.slice(0,10) }}</td>
        <td>{{ p.tipo }}</td>
        <td><span class="badge" :class="p.estatus === 'calculado' ? 'aprobada' : 'pendiente'">{{ p.estatus }}</span></td>
        <td>
          <button @click="calcular(p)">Calcular</button>
          <button class="ghost" @click="verRecibos(p)">Ver recibos</button>
        </td>
      </tr>
    </tbody>
  </table>

  <div v-if="seleccionado">
    <h3>Recibos — {{ seleccionado.fecha_inicio?.slice(0,10) }} a {{ seleccionado.fecha_fin?.slice(0,10) }}</h3>
    <table>
      <thead><tr><th>Empleado</th><th>Días</th><th>H. Extra</th><th>Percepciones</th><th>Deducciones</th><th>Neto</th><th></th></tr></thead>
      <tbody>
        <tr v-for="r in recibos" :key="r.id">
          <td>{{ r.empleado }}</td><td>{{ r.dias_trabajados }}</td><td>{{ r.horas_extra }}</td>
          <td>${{ Number(r.total_percepciones).toFixed(2) }}</td>
          <td>${{ Number(r.total_deducciones).toFixed(2) }}</td>
          <td><b>${{ Number(r.neto_pagar).toFixed(2) }}</b></td>
          <td><button class="ghost" @click="descargarRecibo(r)">⬇️ PDF</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
