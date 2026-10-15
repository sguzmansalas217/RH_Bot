<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import QRCode from 'qrcode';
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
import Prospectos from './views/Prospectos.vue';

const logged = ref(!!getToken());
const rol = ref(getRol());
const email = ref('');
const password = ref('');
const error = ref('');
const cargando = ref(false);
const verPassword = ref(false);
const menuOpen = ref(false); // menú lateral abierto en móvil

// Contacto por WhatsApp en el login: número del bot + QR que abre el chat.
const contacto = ref(null);
const qrContacto = ref('');
onMounted(async () => {
  if (logged.value) return;
  try {
    const c = await fetch('/api/contacto').then((r) => r.json());
    if (!c?.numero) return;
    contacto.value = c;
    qrContacto.value = await QRCode.toDataURL(c.link, { margin: 1, width: 240, color: { dark: '#075e54', light: '#ffffff' } });
  } catch { /* sin contacto: el login funciona igual */ }
});

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
  prospectos: Prospectos,
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
// Súper-admin: cuántos prospectos que dejaron sus datos siguen sin atender (contador del menú).
const prospectosNuevos = ref(0);
async function contarProspectos() {
  if (!logged.value || !esSuper.value) return;
  try {
    const lista = await api.get('/admin/prospectos');
    prospectosNuevos.value = lista.filter((p) => p.estatus === 'nuevo' && (p.nombre || p.empresa)).length;
  } catch { /* el contador es opcional */ }
}
onMounted(contarProspectos);
const timerProspectos = setInterval(contarProspectos, 60000);
onUnmounted(() => clearInterval(timerProspectos));

const menu = computed(() =>
  esSuper.value
    ? [
        ['empresas', '🏢 Empresas'],
        ['prospectos', `🎯 Prospectos${prospectosNuevos.value ? ` (${prospectosNuevos.value})` : ''}`],
        ['tablas', '📊 Tablas ISR/IMSS'],
      ]
    : menuAdmin
);
// Permite abrir una pestaña directo con ?vista=prospectos (link del aviso por WhatsApp).
const vistaUrl = new URLSearchParams(location.search).get('vista');
const vista = ref(
  vistaUrl && menu.value.some(([k]) => k === vistaUrl) ? vistaUrl : esSuper.value ? 'empresas' : 'empleados'
);

async function login() {
  if (cargando.value) return;
  error.value = '';
  if (!email.value || !password.value) {
    error.value = 'Ingresa tu correo y contraseña';
    return;
  }
  cargando.value = true;
  try {
    const { token, usuario } = await api.post('/login', { email: email.value, password: password.value });
    setToken(token);
    setRol(usuario?.rol);
    rol.value = usuario?.rol;
    vista.value = vistaUrl && menu.value.some(([k]) => k === vistaUrl)
      ? vistaUrl : esSuper.value ? 'empresas' : 'empleados';
    logged.value = true;
    contarProspectos();
  } catch (e) {
    error.value = 'Credenciales inválidas';
  } finally {
    cargando.value = false;
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
  if (key === 'prospectos') contarProspectos();
}
</script>

<template>
  <div v-if="!logged" class="login-page">
    <!-- Panel de marca (se oculta en móvil) -->
    <section class="login-brand">
      <div class="brand-top">
        <span class="brand-logo">N</span>
        <span class="brand-name">Nexori RH</span>
      </div>
      <div class="brand-body">
        <h1>Gestiona a tu equipo desde un solo lugar</h1>
        <p>Asistencias por WhatsApp, geocercas, ausencias y nómina, todo integrado.</p>
        <ul class="brand-features">
          <li><span>🕐</span> Registro de asistencias en tiempo real</li>
          <li><span>📍</span> Control por obras y geocercas</li>
          <li><span>✅</span> Aprobaciones y ausencias sin papeleo</li>
          <li><span>💰</span> Cálculo de nómina con ISR e IMSS</li>
        </ul>
        <a v-if="contacto" class="contacto" :href="contacto.link" target="_blank" rel="noopener">
          <img :src="qrContacto" alt="Código QR para escribirnos por WhatsApp" />
          <div>
            <small>¿Quieres Nexori RH en tu empresa?</small>
            <b>📲 {{ contacto.legible }}</b>
            <span>Escanea el código o toca aquí para escribirnos por WhatsApp</span>
          </div>
        </a>
      </div>
      <small class="brand-foot">© {{ new Date().getFullYear() }} Nexori System</small>
    </section>

    <!-- Formulario -->
    <section class="login-side">
      <form class="login-form" @submit.prevent="login">
        <div class="login-mobile-brand"><span class="brand-logo">N</span> Nexori RH</div>
        <h2>Bienvenido 👋</h2>
        <p class="login-sub">Inicia sesión para entrar al panel</p>

        <div class="field">
          <label for="login-email">Correo electrónico</label>
          <div class="input-icon">
            <span class="ico">✉️</span>
            <input id="login-email" v-model="email" type="email" autocomplete="username" placeholder="tucorreo@empresa.com" />
          </div>
        </div>
        <div class="field">
          <label for="login-pass">Contraseña</label>
          <div class="input-icon">
            <span class="ico">🔒</span>
            <input id="login-pass" v-model="password" :type="verPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="••••••••" />
            <button type="button" class="toggle-pass" @click="verPassword = !verPassword" :aria-label="verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
              {{ verPassword ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <div v-if="error" class="login-error">⚠️ {{ error }}</div>

        <button type="submit" class="login-btn" :disabled="cargando">
          <span v-if="cargando" class="spinner"></span>
          {{ cargando ? 'Entrando…' : 'Entrar' }}
        </button>

        <!-- En móvil el panel de marca se oculta: el contacto va debajo del formulario -->
        <a v-if="contacto" class="contacto-movil" :href="contacto.link" target="_blank" rel="noopener">
          ¿Quieres Nexori RH en tu empresa?<br />
          <b>📲 Escríbenos al {{ contacto.legible }}</b>
        </a>
      </form>
    </section>
  </div>

  <div v-else class="shell">
    <!-- Barra superior (solo visible en móvil) -->
    <header class="topbar">
      <button class="hamburger" @click="menuOpen = true" aria-label="Abrir menú">☰</button>
      <span class="topbar-title"><span class="side-logo">N</span> Nexori RH</span>
    </header>

    <!-- Fondo oscuro al abrir el menú en móvil -->
    <div v-if="menuOpen" class="overlay" @click="menuOpen = false"></div>

    <nav class="sidebar" :class="{ open: menuOpen }">
      <h1><span class="side-logo">N</span> Nexori RH</h1>
      <a v-for="[key, label] in menu" :key="key" :class="{ active: vista === key }" @click="selectVista(key)">{{ label }}</a>
      <a style="margin-top:20px;opacity:.8" @click="logout">🚪 Salir</a>
    </nav>
    <main class="main">
      <component :is="vistas[vista]" />
    </main>
  </div>
</template>
