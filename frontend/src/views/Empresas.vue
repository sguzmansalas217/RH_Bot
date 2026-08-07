<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const empresas = ref([]);
const vacio = () => ({ nombre: '', rfc: '', adminNombre: '', adminEmail: '', adminPassword: '', adminWhatsapp: '' });
const form = ref(vacio());
const error = ref('');
const ok = ref('');

// Edición de datos de una empresa existente
const editForm = ref(null); // { id, nombre, rfc }
const showEdit = ref(false);

async function cargar() { empresas.value = await api.get('/admin/empresas'); }

async function editar(e) {
  error.value = ''; ok.value = '';
  try {
    // Trae la configuración completa de la empresa
    editForm.value = await api.get(`/admin/empresas/${e.id}`);
    showEdit.value = true;
  } catch (err) {
    error.value = err.message || 'No se pudieron cargar los datos de la empresa.';
  }
}

async function guardarEdicion() {
  error.value = ''; ok.value = '';
  if (!editForm.value.nombre || !editForm.value.nombre.trim())
    return (error.value = 'El nombre de la empresa es obligatorio.');
  try {
    await api.put(`/admin/empresas/${editForm.value.id}`, editForm.value);
    ok.value = `✅ Datos de la empresa actualizados.`;
    showEdit.value = false;
    await cargar();
  } catch (e) {
    error.value = e.message || 'No se pudo actualizar la empresa.';
  }
}

async function crear() {
  error.value = ''; ok.value = '';
  if (!form.value.nombre || !form.value.adminEmail || !form.value.adminPassword)
    return (error.value = 'Faltan datos: nombre de empresa, correo y contraseña del admin.');
  try {
    const empresa = await api.post('/admin/empresas', form.value);
    ok.value = `✅ Empresa "${empresa.nombre}" creada con su administrador.`;
    form.value = vacio();
    await cargar();
  } catch (e) {
    error.value = e.message || 'No se pudo crear la empresa.';
  }
}

async function eliminar(e) {
  error.value = ''; ok.value = '';
  const escrito = window.prompt(
    `⚠️ Vas a ELIMINAR la empresa "${e.nombre}" y TODOS sus datos ` +
      `(empleados, obras, asistencias, solicitudes, nómina, mensajes). ` +
      `Esta acción NO se puede deshacer.\n\n` +
      `Para confirmar, escribe el nombre exacto de la empresa:`
  );
  if (escrito === null) return; // canceló
  if (escrito.trim() !== e.nombre) {
    error.value = 'El nombre no coincide. No se eliminó nada.';
    return;
  }
  try {
    await api.del(`/admin/empresas/${e.id}`);
    ok.value = `🗑️ Empresa "${e.nombre}" eliminada por completo.`;
    await cargar();
  } catch (err) {
    error.value = err.message || 'No se pudo eliminar la empresa.';
  }
}

onMounted(cargar);
</script>

<template>
  <h2>🏢 Empresas</h2>
  <p style="color:var(--muted)">Alta de empresas nuevas y su primer administrador. Cada empresa solo verá lo suyo.</p>

  <div class="card" style="margin-bottom:20px;max-width:720px">
    <h3>Nueva empresa</h3>
    <div class="grid2">
      <div class="field"><label>Nombre de la empresa *</label><input v-model="form.nombre" placeholder="Constructora XYZ S.A. de C.V." /></div>
      <div class="field"><label>RFC</label><input v-model="form.rfc" placeholder="XAXX010101000" /></div>
    </div>

    <h3 style="margin:16px 0 8px">Primer administrador (con quién iniciará sesión)</h3>
    <div class="grid2">
      <div class="field"><label>Nombre del admin</label><input v-model="form.adminNombre" placeholder="María López" /></div>
      <div class="field"><label>WhatsApp del admin (para aprobar por chat)</label><input v-model="form.adminWhatsapp" placeholder="5214491234567" /></div>
      <div class="field"><label>Correo *</label><input v-model="form.adminEmail" placeholder="admin@constructora.com" /></div>
      <div class="field"><label>Contraseña *</label><input v-model="form.adminPassword" placeholder="mínimo 6 caracteres" /></div>
    </div>

    <p v-if="error" style="color:#c0392b">{{ error }}</p>
    <p v-if="ok" style="color:#065f46">{{ ok }}</p>

    <div class="row" style="justify-content:end">
      <button @click="crear">Crear empresa</button>
    </div>
  </div>

  <table>
    <thead><tr><th>#</th><th>Empresa</th><th>RFC</th><th>Empleados</th><th>Admins</th><th>Acciones</th></tr></thead>
    <tbody>
      <tr v-for="e in empresas" :key="e.id">
        <td>{{ e.id }}</td>
        <td>{{ e.nombre }}</td>
        <td>{{ e.rfc || '—' }}</td>
        <td>{{ e.empleados }}</td>
        <td>{{ e.admins }}</td>
        <td>
          <button class="ghost" @click="editar(e)">✏️ Editar</button>
          <button class="danger" @click="eliminar(e)">🗑️ Eliminar</button>
        </td>
      </tr>
    </tbody>
  </table>

  <div v-if="showEdit" class="modal-bg" @click.self="showEdit = false">
    <div class="modal" style="width:min(640px,100%)">
      <h3>Editar empresa</h3>

      <h4 style="margin:8px 0 6px">Datos generales</h4>
      <div class="grid2">
        <div class="field"><label>Nombre de la empresa *</label><input v-model="editForm.nombre" /></div>
        <div class="field"><label>RFC</label><input v-model="editForm.rfc" placeholder="XAXX010101000" /></div>
      </div>

      <h4 style="margin:14px 0 6px">Jornada y asistencia</h4>
      <div class="grid2">
        <div class="field"><label>Horas de jornada (por día)</label><input type="number" v-model.number="editForm.horas_jornada" /></div>
        <div class="field"><label>Días de la semana laboral</label><input type="number" v-model.number="editForm.dias_semana_laboral" /></div>
        <div class="field"><label>Tolerancia de retardo (minutos)</label><input type="number" v-model.number="editForm.tolerancia_retardo_min" /></div>
      </div>

      <h4 style="margin:14px 0 6px">Horas extra y primas</h4>
      <div class="grid2">
        <div class="field"><label>Factor horas extra dobles</label><input type="number" step="0.1" v-model.number="editForm.factor_hora_extra_doble" /></div>
        <div class="field"><label>Factor horas extra triples</label><input type="number" step="0.1" v-model.number="editForm.factor_hora_extra_triple" /></div>
        <div class="field"><label>Prima dominical</label><input type="number" step="0.01" v-model.number="editForm.prima_dominical_pct" /></div>
        <div class="field"><label>Prima vacacional</label><input type="number" step="0.01" v-model.number="editForm.prima_vacacional_pct" /></div>
        <div class="field"><label>Días de aguinaldo</label><input type="number" v-model.number="editForm.dias_aguinaldo" /></div>
      </div>

      <p v-if="error" style="color:#c0392b">{{ error }}</p>
      <div class="row" style="justify-content:end;margin-top:8px">
        <button class="ghost" @click="showEdit = false">Cancelar</button>
        <button @click="guardarEdicion">Guardar</button>
      </div>
    </div>
  </div>
</template>
