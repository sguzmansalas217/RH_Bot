<script setup>
import { ref, onMounted } from 'vue';
import { api, getToken, setToken, clearToken } from './api.js';
import Empleados from './views/Empleados.vue';
import Obras from './views/Obras.vue';
import Asistencias from './views/Asistencias.vue';
import Aprobaciones from './views/Aprobaciones.vue';
import Nomina from './views/Nomina.vue';
import Incidencias from './views/Incidencias.vue';

const logged = ref(!!getToken());
const email = ref('admin@demo.com');
const password = ref('admin123');
const error = ref('');
const vista = ref('empleados');

const vistas = {
  empleados: Empleados,
  obras: Obras,
  asistencias: Asistencias,
  aprobaciones: Aprobaciones,
  nomina: Nomina,
  incidencias: Incidencias,
};
const menu = [
  ['empleados', '👥 Empleados'],
  ['obras', '📍 Obras / Geocercas'],
  ['asistencias', '🕐 Asistencias'],
  ['aprobaciones', '✅ Aprobaciones'],
  ['nomina', '💰 Nómina'],
  ['incidencias', '⚠️ Incidencias'],
];

async function login() {
  error.value = '';
  try {
    const { token } = await api.post('/login', { email: email.value, password: password.value });
    setToken(token);
    logged.value = true;
  } catch (e) {
    error.value = 'Credenciales inválidas';
  }
}
function logout() {
  clearToken();
  logged.value = false;
}
</script>

<template>
  <div v-if="!logged" class="login-wrap">
    <div class="card login-box">
      <h2>Panel RH</h2>
      <div class="field"><label>Correo</label><input v-model="email" /></div>
      <div class="field"><label>Contraseña</label><input type="password" v-model="password" @keyup.enter="login" /></div>
      <p v-if="error" style="color:#c0392b">{{ error }}</p>
      <button style="width:100%" @click="login">Entrar</button>
    </div>
  </div>

  <div v-else class="shell">
    <nav class="sidebar">
      <h1>🤖 RH WhatsApp</h1>
      <a v-for="[key, label] in menu" :key="key" :class="{ active: vista === key }" @click="vista = key">{{ label }}</a>
      <a style="margin-top:20px;opacity:.8" @click="logout">🚪 Salir</a>
    </nav>
    <main class="main">
      <component :is="vistas[vista]" />
    </main>
  </div>
</template>
