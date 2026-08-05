<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const empleados = ref([]);
const catalogos = ref({ puestos: [], departamentos: [], obras: [], horarios: [] });
const conceptos = ref([]);       // catálogo de bonos/deducciones de la empresa
const asignaciones = ref([]);    // todas las asignaciones (para precargar al editar)
const showModal = ref(false);
const form = ref({});

async function cargar() {
  const [empleados_, puestos, departamentos, obras, horarios, conceptos_, asignaciones_] = await Promise.all([
    api.get('/empleados'), api.get('/puestos'), api.get('/departamentos'),
    api.get('/obras'), api.get('/horarios'), api.get('/conceptos'), api.get('/asignaciones'),
  ]);
  empleados.value = empleados_;
  catalogos.value = { puestos, departamentos, obras, horarios };
  conceptos.value = conceptos_;
  asignaciones.value = asignaciones_;
}

function nuevo() {
  form.value = { salario_diario: 0, dias_vacaciones_saldo: 12, obra_ids: [], asignaciones: [], _quitadas: [] };
  showModal.value = true;
}
function editar(e) {
  // Copia el arreglo de obras para no mutar la fila de la tabla
  form.value = {
    ...e,
    obra_ids: [...(e.obra_ids || [])],
    // Precarga los bonos/deducciones ya asignados a este empleado
    asignaciones: asignaciones.value.filter((a) => a.empleado_id === e.id).map((a) => ({ ...a })),
    _quitadas: [],
  };
  showModal.value = true;
}
async function darBaja(e) {
  if (confirm(`¿Dar de baja a ${e.nombre}?`)) {
    await api.del(`/empleados/${e.id}`);
    await cargar();
  }
}

// ── Bonos y deducciones dentro de la ficha del empleado ──
function agregarConcepto() {
  if (!conceptos.value.length) return;
  form.value.asignaciones.push({ concepto_id: null, monto: 0, porcentaje: null });
}
function quitarConcepto(i) {
  const a = form.value.asignaciones[i];
  if (a.id) form.value._quitadas.push(a.id); // marcar para borrar en el servidor
  form.value.asignaciones.splice(i, 1);
}
function naturalezaDe(conceptoId) {
  const c = conceptos.value.find((x) => x.id === conceptoId);
  return c ? c.naturaleza : null;
}

async function guardar() {
  // 1) Guarda/crea al empleado y obtén su id
  let empId = form.value.id;
  if (empId) {
    await api.put(`/empleados/${empId}`, form.value);
  } else {
    const creado = await api.post('/empleados', form.value);
    empId = creado.id;
  }

  // 2) Sincroniza los bonos/deducciones asignados
  for (const id of form.value._quitadas || []) {
    await api.del(`/asignaciones/${id}`);
  }
  for (const a of form.value.asignaciones || []) {
    if (!a.id && a.concepto_id) {
      await api.post('/asignaciones', {
        empleado_id: empId,
        concepto_id: a.concepto_id,
        monto: a.monto || null,
        porcentaje: a.porcentaje || null,
      });
    }
  }

  showModal.value = false;
  await cargar();
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

      <!-- ── Bonos y deducciones de este empleado ── -->
      <div class="field" style="margin-top:6px">
        <label>Bonos y deducciones</label>
        <p style="color:#667;font-size:13px;margin:2px 0 10px">
          Se aplican cada nómina. Usa monto fijo <b>o</b> porcentaje del sueldo. Los conceptos se crean en “Bonos / Conceptos”.
        </p>

        <div v-for="(a, i) in form.asignaciones" :key="a.id || 'n' + i" class="deduc-card">
          <div class="deduc-top">
            <select v-model="a.concepto_id" :disabled="!!a.id" class="deduc-concepto">
              <option :value="null">— Elegir concepto —</option>
              <option v-for="c in conceptos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </select>
            <span
              v-if="naturalezaDe(a.concepto_id)"
              class="deduc-tipo"
              :style="{ color: naturalezaDe(a.concepto_id) === 'percepcion' ? '#065f46' : '#c0392b' }"
            >{{ naturalezaDe(a.concepto_id) === 'percepcion' ? 'Bono (+)' : 'Deducción (−)' }}</span>
          </div>
          <div class="deduc-bottom">
            <div class="field" style="margin:0">
              <label style="font-size:12px">Monto ($)</label>
              <input type="number" v-model.number="a.monto" :disabled="!!a.id" />
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:12px">o Porcentaje (%)</label>
              <input type="number" v-model.number="a.porcentaje" :disabled="!!a.id" placeholder="opcional" />
            </div>
            <button class="danger" type="button" @click="quitarConcepto(i)">Quitar</button>
          </div>
        </div>

        <p v-if="!form.asignaciones || !form.asignaciones.length" style="color:#667;font-size:13px;margin:0 0 10px">
          Sin bonos ni deducciones asignados.
        </p>
        <button class="ghost" type="button" @click="agregarConcepto" :disabled="!conceptos.length">
          + Agregar bono / deducción
        </button>
        <p v-if="!conceptos.length" style="color:#667;font-size:13px;margin:6px 0 0">
          Primero crea conceptos en “Bonos / Conceptos”.
        </p>
      </div>

      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showModal = false">Cancelar</button>
        <button @click="guardar">Guardar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ventana un poco más ancha para que quepan los bonos/deducciones cómodos */
.modal { width: min(560px, 100%); }

/* Cada bono/deducción en su propia tarjeta apilada (se ve ordenado en móvil y escritorio) */
.deduc-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fafafa;
}
.deduc-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.deduc-concepto { flex: 1; min-width: 0; }
.deduc-tipo { font-size: 13px; font-weight: 600; white-space: nowrap; }
.deduc-bottom { display: flex; align-items: end; gap: 10px; }
.deduc-bottom .field { flex: 1; }
.deduc-bottom .danger { white-space: nowrap; }
</style>
