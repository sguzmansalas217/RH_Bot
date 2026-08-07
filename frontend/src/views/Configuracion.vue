<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const form = ref({});
const guardado = ref(false);

// Catálogos de la empresa: puestos y departamentos
const puestos = ref([]);
const departamentos = ref([]);
const nuevoPuesto = ref({ nombre: '' });
const nuevoDepto = ref({ nombre: '' });

async function cargar() {
  form.value = await api.get('/empresa');
  await cargarCatalogos();
}
async function cargarCatalogos() {
  [puestos.value, departamentos.value] = await Promise.all([
    api.get('/puestos'), api.get('/departamentos'),
  ]);
}
async function guardar() {
  form.value = await api.put('/empresa', form.value);
  guardado.value = true;
  setTimeout(() => (guardado.value = false), 2500);
}

// ── Puestos ──
async function agregarPuesto() {
  if (!nuevoPuesto.value.nombre.trim()) return;
  await api.post('/puestos', { nombre: nuevoPuesto.value.nombre });
  nuevoPuesto.value = { nombre: '' };
  await cargarCatalogos();
}
async function guardarPuesto(p) {
  await api.put(`/puestos/${p.id}`, { nombre: p.nombre });
}
async function eliminarPuesto(p) {
  if (confirm(`¿Eliminar el puesto "${p.nombre}"? Los empleados que lo tengan quedarán sin puesto.`)) {
    await api.del(`/puestos/${p.id}`); await cargarCatalogos();
  }
}

// ── Departamentos ──
async function agregarDepto() {
  if (!nuevoDepto.value.nombre.trim()) return;
  await api.post('/departamentos', nuevoDepto.value);
  nuevoDepto.value = { nombre: '' };
  await cargarCatalogos();
}
async function guardarDepto(d) {
  await api.put(`/departamentos/${d.id}`, { nombre: d.nombre });
}
async function eliminarDepto(d) {
  if (confirm(`¿Eliminar el departamento "${d.nombre}"? Los empleados que lo tengan quedarán sin departamento.`)) {
    await api.del(`/departamentos/${d.id}`); await cargarCatalogos();
  }
}

onMounted(cargar);
</script>

<template>
  <div class="toolbar">
    <h2>Configuración de la empresa</h2>
    <button @click="guardar">Guardar cambios</button>
  </div>

  <p v-if="guardado" style="color:#065f46">✅ Cambios guardados.</p>

  <div class="card" style="max-width:640px">
    <div class="field"><label>Nombre de la empresa</label><input v-model="form.nombre" /></div>

    <h3 style="margin:18px 0 8px">Jornada y asistencia</h3>
    <div class="grid2">
      <div class="field"><label>Horas de jornada (por día)</label><input type="number" v-model.number="form.horas_jornada" /></div>
      <div class="field"><label>Tolerancia de retardo (minutos)</label><input type="number" v-model.number="form.tolerancia_retardo_min" /></div>
    </div>
    <p style="color:#667;font-size:13px;margin:0">Después de la hora de entrada + estos minutos, se cuenta como retardo. Arriba de la jornada, cuenta como horas extra.</p>

    <h3 style="margin:18px 0 8px">Horas extra</h3>
    <div class="grid2">
      <div class="field"><label>Factor horas extra dobles</label><input type="number" step="0.1" v-model.number="form.factor_hora_extra_doble" /></div>
      <div class="field"><label>Factor horas extra triples</label><input type="number" step="0.1" v-model.number="form.factor_hora_extra_triple" /></div>
    </div>
    <p style="color:#667;font-size:13px;margin:0">Las primeras 9 h extra a la semana se pagan al factor doble (2.0) y el excedente al triple (3.0), según la ley.</p>

    <h3 style="margin:18px 0 8px">Prestaciones (valores decimales: 0.25 = 25%)</h3>
    <div class="grid2">
      <div class="field"><label>Prima dominical</label><input type="number" step="0.01" v-model.number="form.prima_dominical_pct" /></div>
      <div class="field"><label>Prima vacacional</label><input type="number" step="0.01" v-model.number="form.prima_vacacional_pct" /></div>
      <div class="field"><label>Días de aguinaldo</label><input type="number" v-model.number="form.dias_aguinaldo" /></div>
    </div>

    <div class="row" style="justify-content:end;margin-top:12px">
      <button @click="guardar">Guardar cambios</button>
    </div>
  </div>

  <!-- ── Puestos ── -->
  <div class="card" style="max-width:640px;margin-top:20px">
    <h3 style="margin:0 0 4px">Puestos</h3>
    <p style="color:#667;font-size:13px;margin:0 0 12px">Los puestos disponibles para asignar a tus empleados.</p>
    <table>
      <thead><tr><th>Nombre</th><th></th></tr></thead>
      <tbody>
        <tr v-for="p in puestos" :key="p.id">
          <td><input v-model="p.nombre" @change="guardarPuesto(p)" /></td>
          <td><button class="danger" @click="eliminarPuesto(p)">Eliminar</button></td>
        </tr>
        <tr v-if="!puestos.length"><td colspan="2" style="color:#667">Aún no hay puestos.</td></tr>
      </tbody>
    </table>
    <div class="row" style="margin-top:10px;align-items:end">
      <div class="field" style="margin:0;flex:1"><label>Nuevo puesto</label><input v-model="nuevoPuesto.nombre" placeholder="Ej. Supervisor" @keyup.enter="agregarPuesto" /></div>
      <button @click="agregarPuesto">+ Agregar</button>
    </div>
  </div>

  <!-- ── Departamentos ── -->
  <div class="card" style="max-width:640px;margin-top:20px">
    <h3 style="margin:0 0 4px">Departamentos</h3>
    <p style="color:#667;font-size:13px;margin:0 0 12px">Las áreas o departamentos de tu empresa.</p>
    <table>
      <thead><tr><th>Nombre</th><th></th></tr></thead>
      <tbody>
        <tr v-for="d in departamentos" :key="d.id">
          <td><input v-model="d.nombre" @change="guardarDepto(d)" /></td>
          <td><button class="danger" @click="eliminarDepto(d)">Eliminar</button></td>
        </tr>
        <tr v-if="!departamentos.length"><td colspan="2" style="color:#667">Aún no hay departamentos.</td></tr>
      </tbody>
    </table>
    <div class="row" style="margin-top:10px;align-items:end">
      <div class="field" style="margin:0;flex:1"><label>Nuevo departamento</label><input v-model="nuevoDepto.nombre" placeholder="Ej. Administración" @keyup.enter="agregarDepto" /></div>
      <button @click="agregarDepto">+ Agregar</button>
    </div>
  </div>
</template>
