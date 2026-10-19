import QRCode from 'qrcode';
import './landing.css';

// Número por defecto (si el servidor no responde); el real viene de /api/contacto.
const MENSAJE = 'Hola, quiero una prueba gratis de Nexori RH';
let numero = '4495502932';

function aplicar() {
  const link = `https://wa.me/52${numero}?text=${encodeURIComponent(MENSAJE)}`;
  document.querySelectorAll('.js-wa').forEach((a) => {
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener';
  });
  document.querySelectorAll('.js-num').forEach((el) => {
    el.textContent = `${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}`;
  });
  const qr = document.querySelector('.js-qr');
  if (qr) {
    QRCode.toDataURL(link, { margin: 1, width: 400, color: { dark: '#075e54', light: '#ffffff' } })
      .then((url) => { qr.src = url; });
  }
}

// ─── Píxel de Meta: eventos de interés (el PageView ya lo manda el código del <head>) ───
const pixel = (...args) => { try { window.fbq?.(...args); } catch { /* sin píxel no pasa nada */ } };
document.querySelectorAll('.js-wa').forEach((a) => {
  a.addEventListener('click', () => pixel('track', 'Contact', { content_name: a.textContent.trim().slice(0, 60) }));
});
document.querySelectorAll('a[href="/panel/"]').forEach((a) => {
  a.addEventListener('click', () => pixel('trackCustom', 'IniciarSesion'));
});
let calcUsada = false;
['calc-emp', 'calc-num'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => {
  if (calcUsada) return;
  calcUsada = true;
  pixel('track', 'ViewContent', { content_name: 'Calculadora de precios' });
}));

document.querySelectorAll('.js-anio').forEach((el) => { el.textContent = new Date().getFullYear(); });

// ─── Calculadora de precio: $899 incluye 10 empleados + $59 por empleado adicional, más IVA ───
const BASE = 899;
const INCLUIDOS = 10;
const EXTRA = 59;
const IVA = 0.16;
const pesos = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const rango = document.getElementById('calc-emp');
const caja = document.getElementById('calc-num');
function calcular(valor) {
  const emp = Math.max(1, Math.min(2000, parseInt(valor, 10) || 1));
  const adicionales = Math.max(0, emp - INCLUIDOS);
  const sub = BASE + adicionales * EXTRA;
  const iva = Math.round(sub * IVA * 100) / 100;
  const total = sub + iva;
  const poner = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
  poner('.js-calc-extra-txt', adicionales
    ? `${adicionales} empleado${adicionales > 1 ? 's' : ''} adicional${adicionales > 1 ? 'es' : ''} × $59`
    : 'Empleados adicionales');
  poner('.js-calc-extra', pesos(adicionales * EXTRA));
  poner('.js-calc-sub', pesos(sub));
  poner('.js-calc-iva', pesos(iva));
  poner('.js-calc-total', pesos(total));
  poner('.js-calc-promo', pesos(total / 2));
  return emp;
}
if (rango && caja) {
  rango.addEventListener('input', () => { caja.value = calcular(rango.value); });
  caja.addEventListener('input', () => {
    const emp = calcular(caja.value);
    rango.value = Math.min(emp, Number(rango.max));
  });
  calcular(caja.value);
}
aplicar();

fetch('/api/contacto')
  .then((r) => r.json())
  .then((c) => {
    if (c?.numero && c.numero !== numero) {
      numero = c.numero;
      aplicar();
    }
  })
  .catch(() => { /* se queda el número por defecto */ });
