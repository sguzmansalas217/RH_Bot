<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const periodo = ref('semanal');
const isr = ref([]);
const imss = ref([]);
const msgIsr = ref(''); const errIsr = ref('');
const msgImss = ref(''); const errImss = ref('');

async function cargarIsr() {
  errIsr.value = ''; msgIsr.value = '';
  isr.value = await api.get(`/admin/isr?periodo=${periodo.value}`);
}
async function cargarImss() {
  imss.value = await api.get('/admin/imss');
}

function agregarRenglon() {
  isr.value.push({ limite_inferior: 0, limite_superior: null, cuota_fija: 0, porcentaje: 0 });
}
function quitarRenglon(i) { isr.value.splice(i, 1); }

async function guardarIsr() {
  errIsr.value = ''; msgIsr.value = '';
  try {
    isr.value = await api.put('/admin/isr', { periodo: periodo.value, renglones: isr.value });
    msgIsr.value = '✅ Tabla de ISR guardada. Recalcula la nómina para que aplique.';
  } catch (e) { errIsr.value = e.message || 'No se pudo guardar.'; }
}
async function guardarImss() {
  errImss.value = ''; msgImss.value = '';
  try {
    imss.value = await api.put('/admin/imss', { parametros: imss.value });
    msgImss.value = '✅ Parámetros de IMSS guardados. Recalcula la nómina para que aplique.';
  } catch (e) { errImss.value = e.message || 'No se pudo guardar.'; }
}

onMounted(() => { cargarIsr(); cargarImss(); });
</script>

<template>
  <h2>📊 Tablas ISR / IMSS</h2>
  <p style="color:var(--muted)">
    Tablas fiscales nacionales (iguales para todas las empresas). Actualízalas cuando el SAT o el
    IMSS publiquen nuevos valores. Después de cambiarlas, vuelve a calcular la nómina.
  </p>

  <!-- ── ISR ── -->
  <div class="card" style="margin-bottom:20px">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">Tarifa ISR (Art. 96 LISR)</h3>
      <div class="field" style="margin:0">
        <label>Periodo</label>
        <select v-model="periodo" @change="cargarIsr">
          <option value="semanal">Semanal</option>
          <option value="mensual">Mensual</option>
        </select>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Límite inferior</th><th>Límite superior</th>
          <th>Cuota fija</th><th>% sobre excedente</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in isr" :key="i">
          <td><input type="number" step="0.01" v-model.number="r.limite_inferior" /></td>
          <td><input type="number" step="0.01" v-model.number="r.limite_superior" placeholder="(en adelante)" /></td>
          <td><input type="number" step="0.01" v-model.number="r.cuota_fija" /></td>
          <td><input type="number" step="0.01" v-model.number="r.porcentaje" /></td>
          <td><button class="danger" @click="quitarRenglon(i)">✕</button></td>
        </tr>
      </tbody>
    </table>
    <p style="color:var(--muted);font-size:.85rem">
      Deja el "límite superior" vacío en el último renglón (significa "en adelante").
    </p>

    <p v-if="errIsr" style="color:#c0392b">{{ errIsr }}</p>
    <p v-if="msgIsr" style="color:#065f46">{{ msgIsr }}</p>

    <div class="row" style="justify-content:space-between">
      <button @click="agregarRenglon">+ Agregar renglón</button>
      <button @click="guardarIsr">Guardar tabla ISR</button>
    </div>
  </div>

  <!-- ── IMSS ── -->
  <div class="card">
    <h3 style="margin-top:0">Cuotas IMSS (parte obrera)</h3>
    <p style="color:var(--muted);font-size:.85rem">Porcentaje que se le descuenta al trabajador sobre su Salario Base de Cotización (SBC).</p>
    <table>
      <thead><tr><th>Concepto</th><th>% obrero</th></tr></thead>
      <tbody>
        <tr v-for="p in imss" :key="p.clave">
          <td>{{ p.descripcion || p.clave }}</td>
          <td><input type="number" step="0.001" v-model.number="p.porcentaje_obrero" style="max-width:140px" /></td>
        </tr>
      </tbody>
    </table>

    <p v-if="errImss" style="color:#c0392b">{{ errImss }}</p>
    <p v-if="msgImss" style="color:#065f46">{{ msgImss }}</p>

    <div class="row" style="justify-content:end">
      <button @click="guardarImss">Guardar IMSS</button>
    </div>
  </div>
</template>
