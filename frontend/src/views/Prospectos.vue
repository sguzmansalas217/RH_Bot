<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '../api.js';

const ESTATUS = [
  ['nuevo', '🆕 Nuevo'],
  ['contactado', '💬 Contactado'],
  ['demo', '📅 Prueba agendada'],
  ['cliente', '✅ Cliente'],
  ['descartado', '🚫 Descartado'],
];
const INTERES = { demo: 'Demo / prueba', promocion: 'Promoción 50%', precio: 'Cotización' };

const rows = ref([]);
const pestana = ref('prueba'); // prueba | solo_preguntaron | todos
const filtroEstatus = ref(''); // '' = todos
const cargando = ref(false);
const error = ref('');
let timer = null;

async function cargar(silencioso = false) {
  if (!silencioso) cargando.value = true;
  error.value = '';
  try {
    rows.value = await api.get('/admin/prospectos');
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

// "Quieren prueba" = dejaron sus datos (nombre o empresa). El resto solo escribió / preguntó.
const dejoDatos = (p) => !!(p.nombre || p.empresa);
const quierenPrueba = computed(() => rows.value.filter(dejoDatos));
const soloPreguntaron = computed(() => rows.value.filter((p) => !dejoDatos(p)));
const nuevosPrueba = computed(() => quierenPrueba.value.filter((p) => p.estatus === 'nuevo').length);

const visibles = computed(() => {
  const base = pestana.value === 'prueba' ? quierenPrueba.value
    : pestana.value === 'solo_preguntaron' ? soloPreguntaron.value : rows.value;
  return filtroEstatus.value ? base.filter((p) => p.estatus === filtroEstatus.value) : base;
});

async function guardar(p, campos) {
  try {
    Object.assign(p, await api.put(`/admin/prospectos/${p.id}`, campos));
  } catch (e) {
    alert(e.message);
  }
}

// Abre tu WhatsApp con un saludo ya escrito y marca al prospecto como contactado.
function escribirle(p) {
  if (!/^\d{10}$/.test(p.whatsapp)) return;
  const nombre = (p.nombre || '').split(' ')[0];
  const texto = `Hola${nombre ? ` ${nombre}` : ''}, te escribo de Nexori RH 👋. ` +
    `Vi que te interesa hacer la prueba del sistema${p.empresa ? ` para ${p.empresa}` : ''}. ` +
    `¿Qué día y hora te queda bien para una videollamada de 15 minutos?`;
  window.open(`https://wa.me/52${p.whatsapp}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  if (p.estatus === 'nuevo') guardar(p, { estatus: 'contactado' });
}

const numero = (num) => (/^\d{10}$/.test(num) ? `${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}` : num);
function hace(ts) {
  const min = Math.round((Date.now() - new Date(ts)) / 60000);
  if (min < 1) return 'justo ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
const fecha = (ts) => new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

onMounted(() => {
  cargar();
  timer = setInterval(() => cargar(true), 60000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="toolbar">
    <h2>🎯 Prospectos</h2>
    <button class="ghost" @click="cargar()">↻ Actualizar</button>
  </div>
  <p style="color:var(--muted);margin-top:-6px">
    Personas que escribieron al WhatsApp del sistema queriendo una prueba o información.
    Toca <b>💬 Escribirle</b> para abrir tu WhatsApp con un saludo listo. Se actualiza solo cada minuto.
  </p>

  <div class="tabs">
    <button :class="{ on: pestana === 'prueba' }" @click="pestana = 'prueba'">
      🙋 Quieren prueba ({{ quierenPrueba.length }})
      <span v-if="nuevosPrueba" class="badge-nuevo">{{ nuevosPrueba }} nuevo{{ nuevosPrueba > 1 ? 's' : '' }}</span>
    </button>
    <button :class="{ on: pestana === 'solo_preguntaron' }" @click="pestana = 'solo_preguntaron'">
      💭 Solo preguntaron ({{ soloPreguntaron.length }})
    </button>
    <button :class="{ on: pestana === 'todos' }" @click="pestana = 'todos'">Todos ({{ rows.length }})</button>
    <select v-model="filtroEstatus" class="filtro">
      <option value="">Cualquier estatus</option>
      <option v-for="[k, l] in ESTATUS" :key="k" :value="k">{{ l }}</option>
    </select>
  </div>

  <p v-if="error" style="color:#c0392b">{{ error }}</p>
  <p v-else-if="cargando" style="color:var(--muted)">Cargando…</p>
  <div v-else-if="!visibles.length" class="card vacio">
    <template v-if="pestana === 'prueba'">
      Todavía nadie ha pedido una prueba. Cuando alguien escriba al WhatsApp del sistema y deje sus datos, aparecerá aquí.
    </template>
    <template v-else>No hay registros.</template>
  </div>

  <div v-else class="lista">
    <div v-for="p in visibles" :key="p.id" class="card prospecto" :class="{ nuevo: p.estatus === 'nuevo' }">
      <div class="cab">
        <div>
          <div class="nombre">{{ p.nombre || 'Sin nombre' }}</div>
          <div class="empresa">🏢 {{ p.empresa || '—' }} <span v-if="p.empleados">· 👥 {{ p.empleados }} empleados</span></div>
        </div>
        <div class="cuando" :title="fecha(p.creado_en)">{{ hace(p.creado_en) }}</div>
      </div>

      <div class="datos">
        <span>📲 {{ numero(p.whatsapp) }}</span>
        <span v-if="p.interes" class="chip">{{ INTERES[p.interes] || p.interes }}</span>
      </div>
      <div v-if="p.primer_mensaje" class="msg">💬 “{{ p.primer_mensaje }}”</div>

      <div class="acciones">
        <button v-if="/^\d{10}$/.test(p.whatsapp)" @click="escribirle(p)">💬 Escribirle</button>
        <select :value="p.estatus" @change="guardar(p, { estatus: $event.target.value })">
          <option v-for="[k, l] in ESTATUS" :key="k" :value="k">{{ l }}</option>
        </select>
        <input :value="p.notas || ''" placeholder="Notas (ej. prueba el lunes 10am)…" @change="guardar(p, { notas: $event.target.value })" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.tabs button { background: #fff; color: var(--text); border: 1px solid var(--border); }
.tabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
.tabs .filtro { width: auto; margin-left: auto; }
.badge-nuevo { margin-left: 6px; background: #ef4444; color: #fff; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.vacio { color: var(--muted); text-align: center; padding: 32px; }
.lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.prospecto { display: flex; flex-direction: column; gap: 10px; border-left: 4px solid transparent; }
.prospecto.nuevo { border-left-color: #ef4444; }
.cab { display: flex; justify-content: space-between; gap: 10px; }
.nombre { font-weight: 700; font-size: 16px; }
.empresa { color: var(--muted); font-size: 14px; margin-top: 2px; }
.cuando { color: var(--muted); font-size: 12px; white-space: nowrap; }
.datos { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 14px; }
.chip { background: #e7f6f2; color: var(--primary-dark); padding: 2px 10px; border-radius: 999px; font-size: 12px; }
.msg { color: var(--muted); font-size: 13px; font-style: italic; }
.acciones { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
.acciones input { grid-column: 1 / -1; }
@media (max-width: 820px) {
  .lista { grid-template-columns: 1fr; }
  .tabs .filtro { margin-left: 0; width: 100%; }
}
</style>
