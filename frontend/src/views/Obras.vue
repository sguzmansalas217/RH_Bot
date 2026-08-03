<script setup>
import { ref, onMounted, watch } from 'vue';
import { api } from '../api.js';

const obras = ref([]);
const vacia = () => ({ tipo: 'obra', radio_metros: 100, lat: null, lon: null });
const form = ref(vacia());
const editId = ref(null); // null = creando; con id = editando
const direccion = ref('');
const buscando = ref(false);
const resultados = ref([]); // opciones que devuelve el buscador para elegir
const coords = ref(''); // texto para pegar coordenadas o link largo de Google Maps

// Objetos de Leaflet (no reactivos)
let map, marker, circle;
const CENTRO_DEFAULT = [21.8853, -102.2916]; // Aguascalientes

async function cargar() { obras.value = await api.get('/obras'); }

// Coloca/mueve el pin y el círculo del radio, y guarda lat/lon en el form
function ponerPunto(lat, lon, centrar = true) {
  form.value.lat = Number(lat.toFixed(6));
  form.value.lon = Number(lon.toFixed(6));
  if (!map) return;
  if (!marker) {
    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      ponerPunto(p.lat, p.lng, false);
    });
  } else {
    marker.setLatLng([lat, lon]);
  }
  dibujarCirculo(lat, lon);
  if (centrar) map.setView([lat, lon], Math.max(map.getZoom(), 15));
}

function dibujarCirculo(lat, lon) {
  const r = Number(form.value.radio_metros) || 100;
  if (!circle) circle = L.circle([lat, lon], { radius: r, color: '#0b8457', fillOpacity: 0.1 }).addTo(map);
  else { circle.setLatLng([lat, lon]); circle.setRadius(r); }
}

// Al cambiar el radio, actualiza el círculo
watch(() => form.value.radio_metros, () => {
  if (marker) dibujarCirculo(marker.getLatLng().lat, marker.getLatLng().lng);
});

// Buscar por dirección (geocodificación gratuita de OpenStreetMap / Nominatim).
// Prefiere la zona visible del mapa y devuelve varias opciones para elegir.
async function buscarDireccion() {
  if (!direccion.value.trim()) return;
  buscando.value = true;
  resultados.value = [];
  try {
    // Sesga los resultados hacia lo que se ve en el mapa (viewbox), sin restringir del todo
    const b = map.getBounds();
    const viewbox = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1`
      + `&countrycodes=mx&limit=6&viewbox=${viewbox}&bounded=0`
      + `&q=${encodeURIComponent(direccion.value)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await r.json();
    if (!data.length) return alert('No encontré esa dirección. Agrega ciudad y estado, ej: "Av. Convención 100, Aguascalientes".');
    resultados.value = data;
    // Si solo hay una opción clara, colócala directo
    if (data.length === 1) elegirResultado(data[0]);
  } catch {
    alert('No se pudo buscar la dirección. Revisa tu conexión.');
  } finally {
    buscando.value = false;
  }
}

function elegirResultado(res) {
  ponerPunto(parseFloat(res.lat), parseFloat(res.lon));
  resultados.value = [];
}

// Pega "21.88, -102.29" o un link largo de Google Maps (.../@21.88,-102.29,17z/...)
function usarCoords() {
  const t = coords.value.trim();
  if (!t) return;
  // Busca un par lat,lon (el @ de los links de Google, o coordenadas sueltas)
  const m = t.match(/(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return alert('No reconocí las coordenadas. Pega algo como: 21.88, -102.29');
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return alert('Esas coordenadas no son válidas.');
  ponerPunto(lat, lon);
  coords.value = '';
}

function editar(o) {
  editId.value = o.id;
  form.value = { nombre: o.nombre, tipo: o.tipo, lat: o.lat, lon: o.lon, radio_metros: o.radio_metros };
  direccion.value = '';
  ponerPunto(Number(o.lat), Number(o.lon));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cancelar() {
  editId.value = null;
  form.value = vacia();
  direccion.value = '';
  resultados.value = [];
  coords.value = '';
  if (marker) { map.removeLayer(marker); marker = null; }
  if (circle) { map.removeLayer(circle); circle = null; }
  map.setView(CENTRO_DEFAULT, 12);
}

async function guardar() {
  if (!form.value.nombre) return alert('Escribe el nombre de la obra.');
  if (form.value.lat == null || form.value.lon == null)
    return alert('Marca la ubicación en el mapa (busca la dirección o haz clic en el mapa).');
  const payload = {
    nombre: form.value.nombre, tipo: form.value.tipo,
    lat: Number(form.value.lat), lon: Number(form.value.lon),
    radio_metros: Number(form.value.radio_metros),
  };
  if (editId.value) await api.put(`/obras/${editId.value}`, payload);
  else await api.post('/obras', payload);
  cancelar();
  await cargar();
}

async function eliminar(o) {
  if (!confirm(`¿Eliminar la obra "${o.nombre}"? Dejará de contar para asistencias.`)) return;
  await api.del(`/obras/${o.id}`);
  await cargar();
}

onMounted(async () => {
  map = L.map('mapaObra').setView(CENTRO_DEFAULT, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }).addTo(map);
  // Clic en el mapa = marcar ahí
  map.on('click', (e) => ponerPunto(e.latlng.lat, e.latlng.lng, false));
  // Leaflet necesita recalcular tamaño tras render
  setTimeout(() => map.invalidateSize(), 200);
  await cargar();
});
</script>

<template>
  <h2>Obras / Geocercas</h2>

  <div class="card" style="margin-bottom:20px">
    <h3>{{ editId ? '✏️ Editar ubicación' : 'Nueva ubicación autorizada' }}</h3>

    <div class="row">
      <div class="field" style="flex:2"><label>Nombre</label><input v-model="form.nombre" placeholder="Obra Centro" /></div>
      <div class="field"><label>Tipo</label>
        <select v-model="form.tipo"><option>obra</option><option>oficina</option><option>planta</option><option>sucursal</option></select>
      </div>
      <div class="field"><label>Radio (m)</label><input type="number" v-model="form.radio_metros" /></div>
    </div>

    <div class="field">
      <label>Buscar dirección</label>
      <div class="row">
        <input v-model="direccion" style="flex:1" placeholder="Ej: Av. Universidad 100, Aguascalientes"
          @keyup.enter="buscarDireccion" />
        <button class="secondary" :disabled="buscando" @click="buscarDireccion">
          {{ buscando ? 'Buscando…' : '🔍 Buscar' }}
        </button>
      </div>
      <ul v-if="resultados.length > 1" class="resultados">
        <li v-for="(r, i) in resultados" :key="i" @click="elegirResultado(r)">📍 {{ r.display_name }}</li>
      </ul>
    </div>

    <div class="field">
      <label>O pega coordenadas</label>
      <div class="row">
        <input v-model="coords" style="flex:1" placeholder="21.88, -102.29  (o un link largo de Google Maps)"
          @keyup.enter="usarCoords" />
        <button class="secondary" @click="usarCoords">Usar</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:4px 0 0">
        En Google Maps: clic derecho sobre el punto → aparecen las coordenadas → cópialas y pégalas aquí.
      </p>
    </div>

    <p style="color:var(--muted);font-size:13px;margin:4px 0">
      📍 Busca la dirección, o haz <strong>clic en el mapa</strong> / arrastra el pin para marcar el punto exacto.
      El círculo verde es el área permitida para checar.
    </p>
    <div id="mapaObra" class="mapa"></div>

    <div class="row" style="align-items:center;margin-top:10px">
      <span style="color:var(--muted);font-size:13px">
        {{ form.lat != null ? `Ubicación: ${form.lat}, ${form.lon}` : 'Sin ubicación marcada' }}
      </span>
      <div style="flex:1"></div>
      <button @click="guardar">{{ editId ? 'Guardar' : 'Agregar' }}</button>
      <button v-if="editId" class="secondary" @click="cancelar">Cancelar</button>
    </div>
  </div>

  <table>
    <thead><tr><th>Nombre</th><th>Tipo</th><th>Latitud</th><th>Longitud</th><th>Radio</th><th></th></tr></thead>
    <tbody>
      <tr v-for="o in obras" :key="o.id">
        <td>{{ o.nombre }}</td><td>{{ o.tipo }}</td>
        <td>{{ Number(o.lat).toFixed(5) }}</td><td>{{ Number(o.lon).toFixed(5) }}</td>
        <td>{{ o.radio_metros }} m</td>
        <td>
          <button @click="editar(o)">Editar</button>
          <button class="danger" @click="eliminar(o)">Eliminar</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.mapa { height: 360px; border-radius: 8px; border: 1px solid var(--border); z-index: 0; }
@media (max-width: 820px) { .mapa { height: 300px; } }
.resultados { list-style: none; margin: 6px 0 0; padding: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.resultados li { padding: 8px 10px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border); }
.resultados li:last-child { border-bottom: none; }
.resultados li:hover { background: #f0fdf4; }
</style>
