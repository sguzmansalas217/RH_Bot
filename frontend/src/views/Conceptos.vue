<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const conceptos = ref([]);
const asignaciones = ref([]);
const empleados = ref([]);

const showConcepto = ref(false);
const showAsignar = ref(false);
const formC = ref({});
const formA = ref({});

async function cargar() {
  [conceptos.value, asignaciones.value, empleados.value] = await Promise.all([
    api.get('/conceptos'), api.get('/asignaciones'), api.get('/empleados'),
  ]);
}

// ── Conceptos (catálogo) ──
function nuevoConcepto() {
  formC.value = { clave: '', nombre: '', naturaleza: 'percepcion', gravable: true };
  showConcepto.value = true;
}
function plantilla(tipo) {
  if (tipo === 'punt') formC.value = { clave: 'BONO_PUNT', nombre: 'Bono de puntualidad', naturaleza: 'percepcion', gravable: true };
  else formC.value = { clave: 'BONO_ASIST', nombre: 'Bono de asistencia', naturaleza: 'percepcion', gravable: true };
  showConcepto.value = true;
}
function editarConcepto(c) { formC.value = { ...c }; showConcepto.value = true; }
async function guardarConcepto() {
  if (formC.value.id) await api.put(`/conceptos/${formC.value.id}`, formC.value);
  else await api.post('/conceptos', formC.value);
  showConcepto.value = false;
  await cargar();
}
async function eliminarConcepto(c) {
  if (confirm(`¿Eliminar el concepto "${c.nombre}"? También se quitarán sus asignaciones.`)) {
    await api.del(`/conceptos/${c.id}`); await cargar();
  }
}

// ── Asignaciones (concepto → empleado) ──
function nuevaAsignacion() {
  formA.value = { empleado_id: null, concepto_id: null, monto: 0, porcentaje: null };
  showAsignar.value = true;
}
async function guardarAsignacion() {
  await api.post('/asignaciones', formA.value);
  showAsignar.value = false;
  await cargar();
}
async function eliminarAsignacion(a) {
  if (confirm('¿Quitar esta asignación?')) { await api.del(`/asignaciones/${a.id}`); await cargar(); }
}

onMounted(cargar);
</script>

<template>
  <div class="toolbar">
    <h2>Bonos y Conceptos de nómina</h2>
    <button @click="nuevoConcepto">+ Nuevo concepto</button>
  </div>

  <div class="card" style="margin-bottom:16px;background:#eef6f5">
    💡 <b>Bonos especiales:</b> usa la clave <b>BONO_PUNT</b> para el <b>bono de puntualidad</b> (se paga solo si el empleado NO tuvo retardos en el periodo) y <b>BONO_ASIST</b> para el <b>bono de asistencia</b> (solo si NO tuvo faltas). Créalos rápido aquí:
    <div class="row" style="margin-top:10px">
      <button class="ghost" @click="plantilla('punt')">+ Bono de puntualidad</button>
      <button class="ghost" @click="plantilla('asist')">+ Bono de asistencia</button>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Clave</th><th>Nombre</th><th>Tipo</th><th>Gravable</th><th></th></tr>
    </thead>
    <tbody>
      <tr v-for="c in conceptos" :key="c.id">
        <td>{{ c.clave }}</td>
        <td>{{ c.nombre }}</td>
        <td>{{ c.naturaleza === 'percepcion' ? 'Percepción (+)' : 'Deducción (−)' }}</td>
        <td>{{ c.gravable ? 'Sí' : 'No' }}</td>
        <td>
          <button class="ghost" @click="editarConcepto(c)">Editar</button>
          <button class="danger" @click="eliminarConcepto(c)">Eliminar</button>
        </td>
      </tr>
      <tr v-if="!conceptos.length"><td colspan="5" style="color:#667">Aún no hay conceptos.</td></tr>
    </tbody>
  </table>

  <div class="toolbar" style="margin-top:28px">
    <h2>Asignaciones a empleados</h2>
    <button @click="nuevaAsignacion" :disabled="!conceptos.length">+ Asignar a empleado</button>
  </div>
  <table>
    <thead>
      <tr><th>Empleado</th><th>Concepto</th><th>Monto</th><th>Porcentaje</th><th></th></tr>
    </thead>
    <tbody>
      <tr v-for="a in asignaciones" :key="a.id">
        <td>{{ a.empleado }}</td>
        <td>{{ a.concepto }} <small style="color:#667">({{ a.clave }})</small></td>
        <td>{{ a.monto != null ? '$' + a.monto : '—' }}</td>
        <td>{{ a.porcentaje != null ? a.porcentaje + '%' : '—' }}</td>
        <td><button class="danger" @click="eliminarAsignacion(a)">Quitar</button></td>
      </tr>
      <tr v-if="!asignaciones.length"><td colspan="5" style="color:#667">Sin asignaciones todavía.</td></tr>
    </tbody>
  </table>

  <!-- Modal concepto -->
  <div v-if="showConcepto" class="modal-bg" @click.self="showConcepto = false">
    <div class="modal">
      <h3>{{ formC.id ? 'Editar' : 'Nuevo' }} concepto</h3>
      <div class="field"><label>Clave (única, ej. BONO_PUNT, BONO_ASIST, VALES)</label><input v-model="formC.clave" /></div>
      <div class="field"><label>Nombre</label><input v-model="formC.nombre" /></div>
      <div class="grid2">
        <div class="field"><label>Tipo</label>
          <select v-model="formC.naturaleza">
            <option value="percepcion">Percepción (suma)</option>
            <option value="deduccion">Deducción (resta)</option>
          </select>
        </div>
        <div class="field"><label>¿Gravable? (paga ISR)</label>
          <select v-model="formC.gravable"><option :value="true">Sí</option><option :value="false">No</option></select>
        </div>
      </div>
      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showConcepto = false">Cancelar</button>
        <button @click="guardarConcepto">Guardar</button>
      </div>
    </div>
  </div>

  <!-- Modal asignación -->
  <div v-if="showAsignar" class="modal-bg" @click.self="showAsignar = false">
    <div class="modal">
      <h3>Asignar concepto a empleado</h3>
      <div class="field"><label>Empleado</label>
        <select v-model="formA.empleado_id"><option :value="null">—</option><option v-for="e in empleados" :key="e.id" :value="e.id">{{ e.nombre }}</option></select>
      </div>
      <div class="field"><label>Concepto</label>
        <select v-model="formA.concepto_id"><option :value="null">—</option><option v-for="c in conceptos" :key="c.id" :value="c.id">{{ c.nombre }}</option></select>
      </div>
      <div class="grid2">
        <div class="field"><label>Monto fijo ($)</label><input type="number" v-model.number="formA.monto" /></div>
        <div class="field"><label>o Porcentaje (% del sueldo)</label><input type="number" v-model.number="formA.porcentaje" placeholder="opcional" /></div>
      </div>
      <p style="color:#667;font-size:13px">Usa monto fijo <b>o</b> porcentaje. Si pones ambos, se suman.</p>
      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showAsignar = false">Cancelar</button>
        <button @click="guardarAsignacion" :disabled="!formA.empleado_id || !formA.concepto_id">Guardar</button>
      </div>
    </div>
  </div>
</template>
