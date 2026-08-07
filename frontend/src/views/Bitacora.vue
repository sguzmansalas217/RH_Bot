<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const hoy = new Date().toISOString().slice(0, 10);
const semanaAtras = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

const desde = ref(semanaAtras);
const hasta = ref(hoy);
const empleadoId = ref(''); // '' = todos
const empleados = ref([]);
const rows = ref([]);
const cargando = ref(false);

async function cargarEmpleados() {
  empleados.value = await api.get('/empleados');
}

async function cargar() {
  cargando.value = true;
  try {
    let url = `/asistencias?desde=${desde.value}&hasta=${hasta.value}`;
    if (empleadoId.value) url += `&empleado=${empleadoId.value}`;
    rows.value = await api.get(url);
  } finally {
    cargando.value = false;
  }
}

// Convierte cada asistencia en eventos (entrada / salida) para la línea de tiempo
const eventos = computed(() => {
  const ev = [];
  for (const r of rows.value) {
    const dia = (r.fecha || '').slice(0, 10);
    if (r.entrada) {
      ev.push({
        id: `e${r.id}`, dia, ts: r.entrada, tipo: 'entrada',
        empleado: r.empleado, obra: r.obra,
        retardo: Number(r.minutos_retardo) || 0,
      });
    }
    if (r.salida) {
      ev.push({
        id: `s${r.id}`, dia, ts: r.salida, tipo: 'salida',
        empleado: r.empleado, obra: r.obra,
        horas: Number(r.horas_trabajadas) || 0,
        extra: Number(r.horas_extra) || 0,
        anticipada: Number(r.salida_anticipada_min) || 0,
      });
    }
    // Entrada sin salida (jornada abierta / sin cerrar)
    if (r.entrada && !r.salida && r.estatus !== 'abierta') {
      ev.push({ id: `x${r.id}`, dia, ts: r.entrada, tipo: 'incompleta', empleado: r.empleado });
    }
  }
  return ev;
});

// Agrupa por día (más reciente primero); dentro del día, cronológico
const dias = computed(() => {
  const grupos = {};
  for (const e of eventos.value) {
    (grupos[e.dia] ||= []).push(e);
  }
  return Object.keys(grupos)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((dia) => ({
      dia,
      eventos: grupos[dia].sort((a, b) => new Date(a.ts) - new Date(b.ts)),
    }));
});

const hora = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const fechaLarga = (dia) =>
  new Date(dia + 'T00:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

onMounted(async () => {
  await cargarEmpleados();
  await cargar();
});
</script>

<template>
  <h2>📋 Bitácora</h2>
  <p style="color:var(--muted)">Entradas y salidas de tu personal en orden de tiempo. Filtra por empleado o por fechas.</p>

  <div class="row" style="margin-bottom:16px;flex-wrap:wrap">
    <div class="field">
      <label>Empleado</label>
      <select v-model="empleadoId">
        <option value="">Todos</option>
        <option v-for="e in empleados" :key="e.id" :value="e.id">{{ e.nombre }}</option>
      </select>
    </div>
    <div class="field"><label>Desde</label><input type="date" v-model="desde" /></div>
    <div class="field"><label>Hasta</label><input type="date" v-model="hasta" /></div>
    <div class="field"><label>&nbsp;</label><button @click="cargar">Filtrar</button></div>
  </div>

  <p v-if="cargando" style="color:var(--muted)">Cargando…</p>
  <p v-else-if="!dias.length" style="color:var(--muted)">No hay movimientos en este rango.</p>

  <div v-for="g in dias" :key="g.dia" class="dia-grupo">
    <h3 class="dia-titulo">{{ fechaLarga(g.dia) }}</h3>
    <div class="timeline">
      <div v-for="e in g.eventos" :key="e.id" class="evento" :class="e.tipo">
        <div class="hora">{{ hora(e.ts) }}</div>
        <div class="punto"></div>
        <div class="detalle">
          <template v-if="e.tipo === 'entrada'">
            <strong>{{ e.empleado }}</strong> entró
            <span v-if="e.obra"> · {{ e.obra }}</span>
            <span v-if="e.retardo > 0" class="chip retardo">⏰ Retardo {{ e.retardo }} min</span>
          </template>
          <template v-else-if="e.tipo === 'salida'">
            <strong>{{ e.empleado }}</strong> salió
            <span class="chip horas">{{ e.horas }} h</span>
            <span v-if="e.extra > 0" class="chip extra">+{{ e.extra }} h extra</span>
            <span v-if="e.anticipada > 0" class="chip anticipada">↩️ Anticipada {{ e.anticipada }} min</span>
          </template>
          <template v-else>
            <strong>{{ e.empleado }}</strong> <span class="chip incompleta">Sin registrar salida</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dia-grupo { margin-bottom: 22px; }
.dia-titulo {
  text-transform: capitalize; margin: 0 0 10px;
  font-size: 15px; color: #334;
  border-bottom: 1px solid var(--border); padding-bottom: 6px;
}
.timeline { display: flex; flex-direction: column; }
.evento {
  display: grid; grid-template-columns: 56px 18px 1fr;
  align-items: center; gap: 8px; padding: 6px 0; position: relative;
}
.hora { text-align: right; color: #667; font-variant-numeric: tabular-nums; font-size: 13px; }
.punto {
  width: 12px; height: 12px; border-radius: 50%;
  justify-self: center; z-index: 1; border: 2px solid #fff;
}
/* Rail vertical que une los puntos */
.evento::before {
  content: ''; position: absolute; left: 63px; top: 0; bottom: 0;
  width: 2px; background: var(--border);
}
.evento:first-child::before { top: 50%; }
.evento:last-child::before { bottom: 50%; }
.evento.entrada .punto { background: #16a34a; }
.evento.salida .punto { background: #dc2626; }
.evento.incompleta .punto { background: #f59e0b; }
.detalle { font-size: 14px; }
.chip {
  display: inline-block; margin-left: 6px; padding: 1px 8px;
  border-radius: 999px; font-size: 12px; white-space: nowrap;
}
.chip.horas { background: #eef2ff; color: #3730a3; }
.chip.extra { background: #ecfdf5; color: #065f46; }
.chip.retardo { background: #fef2f2; color: #b91c1c; }
.chip.anticipada { background: #fffbeb; color: #b45309; }
.chip.incompleta { background: #fff7ed; color: #c2410c; }
</style>
