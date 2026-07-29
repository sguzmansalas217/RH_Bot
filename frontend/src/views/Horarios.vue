<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const horarios = ref([]);
const showModal = ref(false);
const form = ref({});
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; // índice = 0..6

async function cargar() {
  horarios.value = await api.get('/horarios');
}
function nuevo() {
  form.value = { nombre: '', hora_entrada: '08:00', hora_salida: '17:00', minutos_comida: 60, dias_laborales: [1, 2, 3, 4, 5, 6] };
  showModal.value = true;
}
function editar(h) {
  form.value = {
    ...h,
    hora_entrada: (h.hora_entrada || '08:00:00').slice(0, 5),
    hora_salida: (h.hora_salida || '17:00:00').slice(0, 5),
    dias_laborales: [...(h.dias_laborales || [])],
  };
  showModal.value = true;
}
async function guardar() {
  if (form.value.id) await api.put(`/horarios/${form.value.id}`, form.value);
  else await api.post('/horarios', form.value);
  showModal.value = false;
  await cargar();
}
async function eliminar(h) {
  if (confirm(`¿Eliminar el horario "${h.nombre}"?`)) {
    await api.del(`/horarios/${h.id}`);
    await cargar();
  }
}
const diasTexto = (arr) => (arr || []).map((d) => DIAS[d]).join(', ');

onMounted(cargar);
</script>

<template>
  <div class="toolbar">
    <h2>Horarios / Turnos</h2>
    <button @click="nuevo">+ Nuevo horario</button>
  </div>

  <table>
    <thead>
      <tr><th>Nombre</th><th>Entrada</th><th>Salida</th><th>Comida (min)</th><th>Días laborales</th><th></th></tr>
    </thead>
    <tbody>
      <tr v-for="h in horarios" :key="h.id">
        <td>{{ h.nombre }}</td>
        <td>{{ (h.hora_entrada || '').slice(0,5) }}</td>
        <td>{{ (h.hora_salida || '').slice(0,5) }}</td>
        <td>{{ h.minutos_comida }}</td>
        <td>{{ diasTexto(h.dias_laborales) }}</td>
        <td>
          <button class="ghost" @click="editar(h)">Editar</button>
          <button class="danger" @click="eliminar(h)">Eliminar</button>
        </td>
      </tr>
      <tr v-if="!horarios.length"><td colspan="6" style="color:#667">Aún no hay horarios. Crea el primero con “+ Nuevo horario”.</td></tr>
    </tbody>
  </table>

  <div v-if="showModal" class="modal-bg" @click.self="showModal = false">
    <div class="modal">
      <h3>{{ form.id ? 'Editar' : 'Nuevo' }} horario</h3>
      <div class="field"><label>Nombre (ej. "Matutino")</label><input v-model="form.nombre" /></div>
      <div class="grid2">
        <div class="field"><label>Hora de entrada</label><input type="time" v-model="form.hora_entrada" /></div>
        <div class="field"><label>Hora de salida</label><input type="time" v-model="form.hora_salida" /></div>
        <div class="field"><label>Minutos de comida</label><input type="number" v-model.number="form.minutos_comida" /></div>
      </div>
      <div class="field">
        <label>Días laborales</label>
        <div class="obras-check" style="flex-direction:row;flex-wrap:wrap;max-height:none">
          <label v-for="(d, i) in DIAS" :key="i" class="chk">
            <input type="checkbox" :value="i" v-model="form.dias_laborales" /> {{ d }}
          </label>
        </div>
      </div>
      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showModal = false">Cancelar</button>
        <button @click="guardar">Guardar</button>
      </div>
    </div>
  </div>
</template>
