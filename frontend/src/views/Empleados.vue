<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const empleados = ref([]);
const catalogos = ref({ puestos: [], departamentos: [], obras: [], horarios: [] });
const showModal = ref(false);
const form = ref({});

async function cargar() {
  empleados.value = await api.get('/empleados');
  const [puestos, departamentos, obras, horarios] = await Promise.all([
    api.get('/puestos'), api.get('/departamentos'), api.get('/obras'), api.get('/horarios'),
  ]);
  catalogos.value = { puestos, departamentos, obras, horarios };
}

function nuevo() {
  form.value = { salario_diario: 0, dias_vacaciones_saldo: 12, obra_ids: [] };
  showModal.value = true;
}
async function guardar() {
  if (form.value.id) await api.put(`/empleados/${form.value.id}`, form.value);
  else await api.post('/empleados', form.value);
  showModal.value = false;
  await cargar();
}
function editar(e) {
  // Copia el arreglo de obras para no mutar la fila de la tabla
  form.value = { ...e, obra_ids: [...(e.obra_ids || [])] };
  showModal.value = true;
}
async function darBaja(e) {
  if (confirm(`¿Dar de baja a ${e.nombre}?`)) {
    await api.del(`/empleados/${e.id}`);
    await cargar();
  }
}

onMounted(cargar);
</script>

<template>
  <div class="toolbar">
    <h2>Empleados</h2>
    <button @click="nuevo">+ Nuevo empleado</button>
  </div>

  <table>
    <thead>
      <tr><th>Nombre</th><th>WhatsApp</th><th>Puesto</th><th>Obra</th><th>Salario diario</th><th>Vac.</th><th></th></tr>
    </thead>
    <tbody>
      <tr v-for="e in empleados" :key="e.id">
        <td>{{ e.nombre }}</td>
        <td>{{ e.whatsapp }}</td>
        <td>{{ e.puesto || '—' }}</td>
        <td>{{ e.obra || '—' }}</td>
        <td>${{ e.salario_diario }}</td>
        <td>{{ e.dias_vacaciones_saldo }}</td>
        <td>
          <button class="ghost" @click="editar(e)">Editar</button>
          <button class="danger" @click="darBaja(e)">Baja</button>
        </td>
      </tr>
    </tbody>
  </table>

  <div v-if="showModal" class="modal-bg" @click.self="showModal = false">
    <div class="modal">
      <h3>{{ form.id ? 'Editar' : 'Nuevo' }} empleado</h3>
      <div class="field"><label>Nombre</label><input v-model="form.nombre" /></div>
      <div class="field"><label>WhatsApp (ej. 5215555555555)</label><input v-model="form.whatsapp" /></div>
      <div class="grid2">
        <div class="field"><label>Puesto</label>
          <select v-model="form.puesto_id"><option :value="null">—</option><option v-for="p in catalogos.puestos" :key="p.id" :value="p.id">{{ p.nombre }}</option></select>
        </div>
        <div class="field"><label>Departamento</label>
          <select v-model="form.departamento_id"><option :value="null">—</option><option v-for="d in catalogos.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
        </div>
        <div class="field"><label>Horario</label>
          <select v-model="form.horario_id"><option :value="null">—</option><option v-for="h in catalogos.horarios" :key="h.id" :value="h.id">{{ h.nombre }}</option></select>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Obras asignadas (puede elegir varias)</label>
          <div class="obras-check">
            <label v-for="o in catalogos.obras" :key="o.id" class="chk">
              <input type="checkbox" :value="o.id" v-model="form.obra_ids" /> {{ o.nombre }}
            </label>
            <p v-if="!catalogos.obras.length" style="color:#667;margin:4px 0">Aún no hay obras. Crea alguna en “Obras / Geocercas”.</p>
          </div>
        </div>
        <div class="field"><label>Salario diario</label><input type="number" v-model.number="form.salario_diario" /></div>
        <div class="field"><label>Días de vacaciones</label><input type="number" v-model.number="form.dias_vacaciones_saldo" /></div>
      </div>
      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showModal = false">Cancelar</button>
        <button @click="guardar">Guardar</button>
      </div>
    </div>
  </div>
</template>
