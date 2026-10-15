<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const ESTATUS = [
  ['nuevo', 'Nuevo'],
  ['contactado', 'Contactado'],
  ['demo', 'Demo agendada'],
  ['cliente', 'Cliente'],
  ['descartado', 'Descartado'],
];

const rows = ref([]);
const filtro = ref(''); // '' = todos
const cargando = ref(false);
const error = ref('');

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    rows.value = await api.get('/admin/prospectos');
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

const visibles = computed(() =>
  filtro.value ? rows.value.filter((p) => p.estatus === filtro.value) : rows.value
);
const conteo = (est) => rows.value.filter((p) => p.estatus === est).length;

async function guardar(p, campos) {
  try {
    Object.assign(p, await api.put(`/admin/prospectos/${p.id}`, campos));
  } catch (e) {
    alert(e.message);
  }
}

// Link para abrir el chat desde tu propio WhatsApp
const linkWa = (num) => (/^\d{10}$/.test(num) ? `https://wa.me/52${num}` : null);
const numero = (num) => (/^\d{10}$/.test(num) ? `${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}` : num);
const fecha = (ts) =>
  new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

onMounted(cargar);
</script>

<template>
  <div class="toolbar">
    <h2>🎯 Prospectos</h2>
    <button class="ghost" @click="cargar">↻ Actualizar</button>
  </div>
  <p style="color:var(--muted)">
    Personas que escribieron al WhatsApp del sistema sin ser empleados. El bot les ofrece Nexori RH y te avisa por WhatsApp.
    Para contestarles desde el número del bot, escríbele al bot: <b>r 4491234567 tu mensaje</b>.
  </p>

  <div class="filtros">
    <button :class="filtro === '' ? '' : 'ghost'" @click="filtro = ''">Todos ({{ rows.length }})</button>
    <button v-for="[k, l] in ESTATUS" :key="k" :class="filtro === k ? '' : 'ghost'" @click="filtro = k">
      {{ l }} ({{ conteo(k) }})
    </button>
  </div>

  <p v-if="error" style="color:#c0392b">{{ error }}</p>
  <p v-else-if="cargando" style="color:var(--muted)">Cargando…</p>
  <p v-else-if="!visibles.length" style="color:var(--muted)">No hay prospectos todavía.</p>

  <table v-else>
    <thead>
      <tr><th>Fecha</th><th>Nombre</th><th>Empresa</th><th>Empleados</th><th>WhatsApp</th><th>Interés</th><th>Estatus</th><th>Notas</th></tr>
    </thead>
    <tbody>
      <tr v-for="p in visibles" :key="p.id">
        <td>{{ fecha(p.creado_en) }}</td>
        <td>
          {{ p.nombre || '—' }}
          <div v-if="p.primer_mensaje" class="msg">💬 {{ p.primer_mensaje }}</div>
        </td>
        <td>{{ p.empresa || '—' }}</td>
        <td>{{ p.empleados ?? '—' }}</td>
        <td>
          <a v-if="linkWa(p.whatsapp)" :href="linkWa(p.whatsapp)" target="_blank" rel="noopener">{{ numero(p.whatsapp) }}</a>
          <span v-else>{{ p.whatsapp }}</span>
        </td>
        <td>{{ p.interes || '—' }}</td>
        <td>
          <select :value="p.estatus" @change="guardar(p, { estatus: $event.target.value })">
            <option v-for="[k, l] in ESTATUS" :key="k" :value="k">{{ l }}</option>
          </select>
        </td>
        <td>
          <input :value="p.notas || ''" placeholder="Agregar nota…" @change="guardar(p, { notas: $event.target.value })" />
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.filtros { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
td select, td input { min-width: 130px; }
.msg { color: var(--muted); font-size: 12px; margin-top: 2px; max-width: 260px; white-space: normal; }
</style>
