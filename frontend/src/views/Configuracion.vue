<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const form = ref({});
const guardado = ref(false);

async function cargar() {
  form.value = await api.get('/empresa');
}
async function guardar() {
  form.value = await api.put('/empresa', form.value);
  guardado.value = true;
  setTimeout(() => (guardado.value = false), 2500);
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
</template>
