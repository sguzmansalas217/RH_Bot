// Convierte docs/MANUAL.md → docs/MANUAL.pdf usando pdfkit (ya instalado en el backend).
// Uso:  cd backend && node scripts/generar-manual-pdf.mjs
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '../../docs');
// Nombre del .md a convertir (por defecto MANUAL.md). Uso:
//   node scripts/generar-manual-pdf.mjs MANUAL-USUARIO.md
const NOMBRE = process.argv[2] || 'MANUAL.md';
const MD = path.join(DOCS, NOMBRE);
const PDF = path.join(DOCS, NOMBRE.replace(/\.md$/i, '.pdf'));

// Helvetica no tiene emojis: los quitamos para que no salgan cuadros vacíos.
const quitarEmoji = (s) =>
  s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s{2,}/g, ' ').trim();

const md = fs.readFileSync(MD, 'utf8');
const lines = md.split(/\r?\n/);

const doc = new PDFDocument({ size: 'LETTER', margins: { top: 60, bottom: 60, left: 64, right: 64 } });
doc.pipe(fs.createWriteStream(PDF));

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const MONO = 'Courier';
const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

// Escribe texto con soporte de **negritas** en línea.
function inline(text, { size = 11, indent = 0, gap = 4 } = {}) {
  const partes = quitarEmoji(text).split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  const x = doc.page.margins.left + indent;
  if (doc.y > doc.page.height - doc.page.margins.bottom - size * 2) doc.addPage();
  doc.fontSize(size);
  partes.forEach((p, i) => {
    const bold = p.startsWith('**') && p.endsWith('**');
    // Quita marcadores sueltos (**, *) que pudieran quedar sin cerrar en la línea.
    const txt = bold ? p.slice(2, -2) : p.replace(/\*\*/g, '').replace(/(^|\s)\*(\S)/g, '$1$2').replace(/(\S)\*(\s|$)/g, '$1$2');
    const opts = { continued: i < partes.length - 1, width: width - indent };
    doc.font(bold ? BOLD : FONT);
    // Solo la primera parte fija la posición (x,y); las demás fluyen a continuación.
    if (i === 0) doc.text(txt, x, doc.y, opts);
    else doc.text(txt, opts);
  });
  doc.moveDown(gap / 10);
}

function heading(text, size, space = 8) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - size * 3) doc.addPage();
  doc.moveDown(0.4);
  doc.font(BOLD).fontSize(size).fillColor('#1a3d5c').text(quitarEmoji(text), doc.page.margins.left);
  doc.fillColor('black').moveDown(0.25);
  doc.y += 2;
}

function regla() {
  doc.moveDown(0.3);
  doc.strokeColor('#cccccc').lineWidth(0.5)
    .moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.strokeColor('black').moveDown(0.5);
}

// Tabla simple a partir de filas markdown | a | b |
function tabla(filas) {
  const celdas = filas.map((f) => f.slice(1, -1).split('|').map((c) => quitarEmoji(c.trim()).replace(/\*\*/g, '')));
  const nCols = Math.max(...celdas.map((c) => c.length));
  const colW = width / nCols;
  const pad = 5;
  if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
  celdas.forEach((fila, idx) => {
    const bold = idx === 0;
    doc.font(bold ? BOLD : FONT).fontSize(9.5);
    const alturas = fila.map((c) => doc.heightOfString(c || '', { width: colW - pad * 2 }));
    const h = Math.max(14, ...alturas) + pad;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y0 = doc.y;
    if (bold) doc.rect(doc.page.margins.left, y0, width, h).fill('#eef3f7').fillColor('black');
    for (let c = 0; c < nCols; c++) {
      const x = doc.page.margins.left + c * colW;
      doc.rect(x, y0, colW, h).strokeColor('#dddddd').lineWidth(0.5).stroke();
      doc.font(bold ? BOLD : FONT).fillColor('black')
        .text(fila[c] || '', x + pad, y0 + pad / 2, { width: colW - pad * 2 });
    }
    doc.y = y0 + h;
  });
  doc.strokeColor('black').moveDown(0.5);
}

// ── Recorrido del markdown ──
for (let i = 0; i < lines.length; i++) {
  let ln = lines[i];

  // Bloque de código ```
  if (ln.trim().startsWith('```')) {
    const buf = [];
    i++;
    while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
    doc.font(MONO).fontSize(9).fillColor('#333');
    const y0 = doc.y;
    doc.rect(doc.page.margins.left, y0, width, buf.length * 11 + 8).fill('#f5f5f5').fillColor('#333');
    doc.text(buf.join('\n'), doc.page.margins.left + 6, y0 + 4, { width: width - 12 });
    doc.fillColor('black').moveDown(0.5);
    continue;
  }

  // Tabla (bloque de líneas que empiezan con |)
  if (ln.trim().startsWith('|')) {
    const filas = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      // Salta la fila separadora (solo contiene |, -, :, espacios).
      if (!/^[\s|:-]+$/.test(lines[i])) filas.push(lines[i].trim());
      i++;
    }
    i--;
    tabla(filas);
    continue;
  }

  if (ln.startsWith('# ')) { heading(ln.slice(2), 20, 12); continue; }
  if (ln.startsWith('## ')) { heading(ln.slice(3), 15); continue; }
  if (ln.startsWith('### ')) { heading(ln.slice(4), 12.5); continue; }
  if (/^---+$/.test(ln.trim())) { regla(); continue; }

  // Listas
  const bullet = ln.match(/^(\s*)[-*]\s+(.*)/);
  if (bullet) {
    const nivel = Math.floor(bullet[1].length / 2);
    inline('•  ' + bullet[2], { size: 10.5, indent: 12 + nivel * 14, gap: 2 });
    continue;
  }
  const ordered = ln.match(/^(\s*)(\d+)\.\s+(.*)/);
  if (ordered) {
    inline(ordered[2] + '.  ' + ordered[3], { size: 10.5, indent: 12, gap: 2 });
    continue;
  }
  const quote = ln.match(/^>\s?(.*)/);
  if (quote) { doc.fillColor('#555'); inline(quote[1], { size: 10, indent: 12, gap: 2 }); doc.fillColor('black'); continue; }

  if (ln.trim() === '') { doc.moveDown(0.35); continue; }

  inline(ln, { size: 11, gap: 4 });
}

doc.end();
console.log('PDF generado en', PDF);
