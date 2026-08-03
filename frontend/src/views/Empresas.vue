<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const empresas = ref([]);
const vacio = () => ({ nombre: '', rfc: '', adminNombre: '', adminEmail: '', adminPassword: '', adminWhatsapp: '' });
const form = ref(vacio());
const error = ref('');
const ok = ref('');

async function cargar() { empresas.value = await api.get('/admin/empresas'); }

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
    <thead><tr><th>#</th><th>Empresa</th><th>RFC</th><th>Empleados</th><th>Admins</th></tr></thead>
    <tbody>
      <tr v-for="e in empresas" :key="e.id">
        <td>{{ e.id }}</td>
        <td>{{ e.nombre }}</td>
        <td>{{ e.rfc || '—' }}</td>
        <td>{{ e.empleados }}</td>
        <td>{{ e.admins }}</td>
      </tr>
    </tbody>
  </table>
</template>
