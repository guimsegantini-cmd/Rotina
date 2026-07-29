// Cálculo de meta hídrica diária a partir do questionário.
// Baseado na referência comum de ~35ml por kg de peso corporal,
// ajustada por altura, faixa etária e nível de atividade física.
// É uma estimativa geral, não uma prescrição médica ou nutricional.
export function calcularMetaAgua({ peso, altura, idade, atividade }) {
  const p = parseFloat(peso);
  const a = parseFloat(altura);
  const i = parseFloat(idade);
  if (!p || p <= 0) return 0;

  let ml = p * 35;

  if (a && a > 170) ml *= 1.05;

  const fatorAtividade = {
    sedentario: 1.0,
    leve: 1.05,
    moderado: 1.12,
    intenso: 1.2,
  }[atividade] || 1.0;
  ml *= fatorAtividade;

  if (i && i >= 55) ml *= 0.95;

  return Math.round(ml / 50) * 50;
}

export function gerarHorarios(inicio, fim, intervaloH) {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const startMin = hi * 60 + mi;
  const endMin = hf * 60 + mf;
  const step = Math.max(1, Number(intervaloH)) * 60;
  const list = [];
  for (let m = startMin; m <= endMin; m += step) {
    list.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return list;
}
