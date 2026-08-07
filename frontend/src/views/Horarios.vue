<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const horarios = ref([]);
const showModal = ref(false);
const form = ref({});
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; // índice = 0..6
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // mostrar Lun..Dom

async function cargar() {
  horarios.value = await api.get('/horarios');
}

// Estructura de edición: un objeto por día con { trabaja, entrada, salida }
function diasVacios(entrada = '08:00', salida = '17:00', trabajaLunVie = true) {
  const d = {};
  for (let i = 0; i <= 6; i++) {
    const trabaja = trabajaLunVie ? i >= 1 && i <= 6 : false;
    d[i] = { trabaja, entrada, salida };
  }
  return d;
}

function nuevo() {
  form.value = { nombre: '', minutos_comida: 60, dias: diasVacios() };
  showModal.value = true;
}

function editar(h) {
  const dias = diasVacios('08:00', '17:00', false); // arranca todos en descanso
  if (h.dias_horario && typeof h.dias_horario === 'object') {
    // Horario por día ya configurado
    for (let i = 0; i <= 6; i++) {
      const d = h.dias_horario[i];
      if (d && d.entrada && d.salida) dias[i] = { trabaja: true, entrada: d.entrada.slice(0, 5), salida: d.salida.slice(0, 5) };
    }
  } else {
    // Horario simple (legado): aplica la misma hora a los días laborales
    const ent = (h.hora_entrada || '08:00:00').slice(0, 5);
    const sal = (h.hora_salida || '17:00:00').slice(0, 5);
    for (const i of h.dias_laborales || []) dias[i] = { trabaja: true, entrada: ent, salida: sal };
  }
  form.value = { id: h.id, nombre: h.nombre, minutos_comida: h.minutos_comida ?? 60, dias };
  showModal.value = true;
}

async function guardar() {
  // Arma dias_horario solo con los días que se trabajan
  const dias_horario = {};
  for (let i = 0; i <= 6; i++) {
    const d = form.value.dias[i];
    if (d.trabaja && d.entrada && d.salida) dias_horario[i] = { entrada: d.entrada, salida: d.salida };
  }
  const payload = { nombre: form.value.nombre, minutos_comida: form.value.minutos_comida, dias_horario };
  if (form.value.id) await api.put(`/horarios/${form.value.id}`, payload);
  else await api.post('/horarios', payload);
  showModal.value = false;
  await cargar();
}

async function eliminar(h) {
  if (confirm(`¿Eliminar el horario "${h.nombre}"?`)) {
    await api.del(`/horarios/${h.id}`);
    await cargar();
  }
}

// Resumen legible del horario para la tabla
function resumen(h) {
  const partes = [];
  if (h.dias_horario && typeof h.dias_horario === 'object') {
    for (const i of ORDEN) {
      const d = h.dias_horario[i];
      if (d && d.entrada && d.salida) partes.push(`${DIAS[i]} ${d.entrada.slice(0, 5)}–${d.salida.slice(0, 5)}`);
    }
  } else {
    const ent = (h.hora_entrada || '').slice(0, 5);
    const sal = (h.hora_salida || '').slice(0, 5);
    for (const i of ORDEN) if ((h.dias_laborales || []).includes(i)) partes.push(`${DIAS[i]} ${ent}–${sal}`);
  }
  return partes.length ? partes.join(' · ') : 'Sin días';
}

onMounted(cargar);
</script>

<template>
  <div class="toolbar">
    <h2>Horarios / Turnos</h2>
    <button @click="nuevo">+ Nuevo horario</button>
  </div>

  <table>
    <thead>
      <tr><th>Nombre</th><th>Días y horas</th><th>Comida (min)</th><th></th></tr>
    </thead>
    <tbody>
      <tr v-for="h in horarios" :key="h.id">
        <td>{{ h.nombre }}</td>
        <td>{{ resumen(h) }}</td>
        <td>{{ h.minutos_comida }}</td>
        <td>
          <button class="ghost" @click="editar(h)">Editar</button>
          <button class="danger" @click="eliminar(h)">Eliminar</button>
        </td>
      </tr>
      <tr v-if="!horarios.length"><td colspan="4" style="color:#667">Aún no hay horarios. Crea el primero con “+ Nuevo horario”.</td></tr>
    </tbody>
  </table>

  <div v-if="showModal" class="modal-bg" @click.self="showModal = false">
    <div class="modal">
      <h3>{{ form.id ? 'Editar' : 'Nuevo' }} horario</h3>
      <div class="field"><label>Nombre (ej. "General")</label><input v-model="form.nombre" /></div>

      <label style="display:block;margin:6px 0 4px;color:var(--muted);font-size:14px">Horario por día</label>
      <p style="color:#667;font-size:13px;margin:0 0 8px">Marca los días que se trabajan y pon su hora. Los que dejes sin marcar son de descanso.</p>
      <div class="dias">
        <div v-for="i in ORDEN" :key="i" class="dia-row" :class="{ off: !form.dias[i].trabaja }">
          <label class="dia-check">
            <input type="checkbox" v-model="form.dias[i].trabaja" /> {{ DIAS[i] }}
          </label>
          <template v-if="form.dias[i].trabaja">
            <input type="time" v-model="form.dias[i].entrada" />
            <span style="color:#667">a</span>
            <input type="time" v-model="form.dias[i].salida" />
          </template>
          <span v-else class="descanso">Descanso</span>
        </div>
      </div>

      <div class="field" style="margin-top:12px;max-width:200px">
        <label>Minutos de comida</label>
        <input type="number" v-model.number="form.minutos_comida" />
      </div>

      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showModal = false">Cancelar</button>
        <button @click="guardar">Guardar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dias { display: flex; flex-direction: column; gap: 6px; }
.dia-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fafafa;
}
.dia-row.off { opacity: .7; }
.dia-check { display: flex; align-items: center; gap: 8px; width: 70px; font-weight: 600; margin: 0; cursor: pointer; }
.dia-check input { width: auto; }
.dia-row input[type="time"] { max-width: 120px; }
.descanso { color: #667; font-style: italic; }
</style>
