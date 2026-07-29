// Copia o worker do pdf.js para public/, para ser servido como asset
// estático. Evita depender do bundling via `new URL(...)` do webpack, que
// quebra o build do Next (o minificador tenta processar o worker como um
// módulo comum). O arquivo copiado fica versionado em public/ (não é
// gerado só em build/dev) porque nem todo pipeline de deploy roda os
// hooks "predev"/"prebuild" do npm antes de "next build" — sem o arquivo
// commitado, o worker fica 404 em produção e a leitura de PDF falha
// silenciosamente. Rode este script de novo sempre que atualizar a
// versão do pdfjs-dist, para manter a cópia em sincronia.
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
