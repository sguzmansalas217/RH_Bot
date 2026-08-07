<script setup>
import { ref, computed } from 'vue';
import { api, getToken, setToken, clearToken, getRol, setRol } from './api.js';
import Empleados from './views/Empleados.vue';
import Empresas from './views/Empresas.vue';
import TablasFiscales from './views/TablasFiscales.vue';
import Obras from './views/Obras.vue';
import Asistencias from './views/Asistencias.vue';
import Bitacora from './views/Bitacora.vue';
import Aprobaciones from './views/Aprobaciones.vue';
import Ausencias from './views/Ausencias.vue';
import Nomina from './views/Nomina.vue';
import Incidencias from './views/Incidencias.vue';
import Horarios from './views/Horarios.vue';
import Conceptos from './views/Conceptos.vue';
import Configuracion from './views/Configuracion.vue';

const logged = ref(!!getToken());
const rol = ref(getRol());
const email = ref('');
const password = ref('');
const error = ref('');
const menuOpen = ref(false); // menú lateral abierto en móvil

const esSuper = computed(() => rol.value === 'superadmin');

const vistas = {
  empresas: Empresas,
  tablas: TablasFiscales,
  empleados: Empleados,
  obras: Obras,
  horarios: Horarios,
  asistencias: Asistencias,
  bitacora: Bitacora,
  aprobaciones: Aprobaciones,
  ausencias: Ausencias,
  nomina: Nomina,
  conceptos: Conceptos,
  incidencias: Incidencias,
  configuracion: Configuracion,
};
// El súper-admin (dueño del sistema) solo administra empresas.
const menuAdmin = [
  ['empleados', '👥 Empleados'],
  ['obras', '📍 Obras / Geocercas'],
  ['horarios', '🕗 Horarios'],
  ['asistencias', '🕐 Asistencias'],
  ['bitacora', '📋 Bitácora'],
  ['aprobaciones', '✅ Aprobaciones'],
  ['ausencias', '🏖️ Ausencias'],
  ['nomina', '💰 Nómina'],
  ['conceptos', '🎁 Bonos / Conceptos'],
  ['incidencias', '⚠️ Incidencias'],
  ['configuracion', '⚙️ Configuración'],
];
const menu = computed(() =>
  esSuper.value
    ? [['empresas', '🏢 Empresas'], ['tablas', '📊 Tablas ISR/IMSS']]
    : menuAdmin
);
const vista = ref(esSuper.value ? 'empresas' : 'empleados');

async function login() {
  error.value = '';
  try {
    const { token, usuario } = await api.post('/login', { email: email.value, password: password.value });
    setToken(token);
    setRol(usuario?.rol);
    rol.value = usuario?.rol;
    vista.value = esSuper.value ? 'empresas' : 'empleados';
    logged.value = true;
  } catch (e) {
    error.value = 'Credenciales inválidas';
  }
}
function logout() {
  clearToken();
  rol.value = null;
  logged.value = false;
}
// En móvil: cambia de vista y cierra el menú deslizable
function selectVista(key) {
  vista.value = key;
  menuOpen.value = false;
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
    <!-- Barra superior (solo visible en móvil) -->
    <header class="topbar">
      <button class="hamburger" @click="menuOpen = true" aria-label="Abrir menú">☰</button>
      <span class="topbar-title">🤖 RH WhatsApp</span>
    </header>

    <!-- Fondo oscuro al abrir el menú en móvil -->
    <div v-if="menuOpen" class="overlay" @click="menuOpen = false"></div>

    <nav class="sidebar" :class="{ open: menuOpen }">
      <h1>🤖 RH WhatsApp</h1>
      <a v-for="[key, label] in menu" :key="key" :class="{ active: vista === key }" @click="selectVista(key)">{{ label }}</a>
      <a style="margin-top:20px;opacity:.8" @click="logout">🚪 Salir</a>
    </nav>
    <main class="main">
      <component :is="vistas[vista]" />
    </main>
  </div>
</template>
