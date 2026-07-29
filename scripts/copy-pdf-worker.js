// Copia o worker do pdf.js para public/, para ser servido como asset
// estático. Evita depender do bundling via `new URL(...)` do webpack, que
// quebra o build do Next (o minificador tenta processar o worker como um
// módulo comum). Roda automaticamente antes de "dev" e "build".
const fs = require("fs");
const path = require("path");

const origem = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destino = path.join(__dirname, "..", "public", "pdf.worker.min.mjs");

if (fs.existsSync(origem)) {
  fs.copyFileSync(origem, destino);
  console.log("✓ public/pdf.worker.min.mjs copiado de pdfjs-dist");
} else {
  console.warn("! pdfjs-dist/build/pdf.worker.min.mjs não encontrado — rode npm install");
}
