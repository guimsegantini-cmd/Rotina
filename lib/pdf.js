"use client";

// Extração de texto de PDFs no navegador usando pdf.js. Usado para ler
// arquivos de dieta em PDF (planos alimentares exportados por
// nutricionistas) sem precisar de um servidor.
// O worker é copiado para public/pdf.worker.min.mjs em build/dev (ver
// scripts/copy-pdf-worker.js) e servido como asset estático — referenciar
// via new URL(...) para o webpack empacotar quebra o build do Next
// (o minificador tenta processar o worker como um módulo comum).
let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Agrupa os fragmentos de texto de uma página por linha (posição Y),
// para reconstituir algo próximo do texto "visual" do PDF.
function agruparLinhas(items) {
  const TOL = 2;
  const ordenado = [...items].sort((a, b) => {
    const ay = a.transform[5], by = b.transform[5];
    if (Math.abs(ay - by) > TOL) return by - ay;
    return a.transform[4] - b.transform[4];
  });
  const linhas = [];
  let atual = null;
  let atualY = null;
  for (const it of ordenado) {
    const y = it.transform[5];
    if (atualY === null || Math.abs(y - atualY) > TOL) {
      if (atual) linhas.push(atual.join(" "));
      atual = [it.str];
      atualY = y;
    } else {
      atual.push(it.str);
    }
  }
  if (atual) linhas.push(atual.join(" "));
  return linhas;
}

export async function extrairTextoPdf(arrayBuffer) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texto += agruparLinhas(content.items).join("\n") + "\n\n";
  }
  return texto;
}

export function dataUrlParaArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}
