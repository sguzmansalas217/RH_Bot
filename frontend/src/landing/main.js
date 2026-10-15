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

document.querySelectorAll('.js-anio').forEach((el) => { el.textContent = new Date().getFullYear(); });
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
