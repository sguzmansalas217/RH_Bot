// Calcula el sueldo diario necesario para que, cumpliendo el horario (7 días
// pagados a la semana), al empleado le quede un NETO semanal objetivo después
// de ISR (tabla del sistema) e IMSS obrero.

// ── Tabla ISR SEMANAL (idéntica al seed del sistema) ──
const ISR = [
  [0.01, 171.78, 0.0, 1.92],
  [171.79, 1458.03, 3.29, 6.4],
  [1458.04, 2562.35, 85.61, 10.88],
  [2562.36, 2978.66, 205.8, 16.0],
  [2978.67, 3566.99, 272.37, 17.92],
  [3567.0, 7192.64, 377.8, 21.36],
  [7192.65, 11336.57, 1152.03, 23.52],
  [11336.58, 21641.63, 2126.86, 30.0],
  [21641.64, 28855.49, 5218.39, 32.0],
  [28855.5, 86566.47, 7526.81, 34.0],
  [86566.48, null, 27148.21, 35.0],
];

function isrSemanal(base) {
  if (base <= 0) return 0;
  const r = [...ISR].reverse().find(([li]) => base >= li);
  if (!r) return 0;
  const [li, , cuota, pct] = r;
  return Math.max(0, Math.round((cuota + (base - li) * (pct / 100)) * 100) / 100);
}

// ── IMSS obrero semanal sobre el SBC (7 días) ──
// UMA 2025 = 113.14 diaria. Excedente de 3 UMA solo para EM en especie (0.40%).
const UMA = 113.14;
function imssSemanal(diario) {
  const sbcSemana = diario * 7;           // cotiza los 7 días
  const tresUMASemana = 3 * UMA * 7;      // 2375.94
  const emExcedente = 0.004 * Math.max(0, sbcSemana - tresUMASemana);
  const fijas = 0.02375 * sbcSemana;      // 0.25+0.375+0.625+1.125 = 2.375%
  return Math.round((emExcedente + fijas) * 100) / 100;
}

// net(d) = 7d - ISR(7d) - IMSS(d)
function netoDe(diario) {
  const bruto = diario * 7;
  return bruto - isrSemanal(bruto) - imssSemanal(diario);
}

// Busca el sueldo diario que da el neto objetivo (búsqueda binaria).
function diarioParaNeto(objetivo) {
  let lo = 0, hi = 5000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (netoDe(mid) < objetivo) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const objetivos = [2800, 3800, 3000, 2600];
console.log('Neto obj. | Sueldo diario | Bruto sem. | ISR sem. | IMSS sem. | Neto real');
for (const obj of objetivos) {
  const d = diarioParaNeto(obj);
  const dR = Math.round(d);            // redondeado a peso entero
  const bruto = dR * 7;
  const isr = isrSemanal(bruto);
  const imss = imssSemanal(dR);
  const neto = Math.round((bruto - isr - imss) * 100) / 100;
  console.log(
    `${String(obj).padStart(8)} | ${String(dR).padStart(12)} | ${String(bruto).padStart(9)} | ${String(isr.toFixed(2)).padStart(8)} | ${String(imss.toFixed(2)).padStart(8)} | ${neto.toFixed(2)}`
  );
}
