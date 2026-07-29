"use client";
import { getGenerativeModel, Schema } from "firebase/ai";
import { ai } from "./firebase";

// Modelo multimodal rápido/barato, compatível com leitura de documentos
// (PDF) — ajuste aqui se o nome do modelo mudar no futuro.
const MODEL_NAME = "gemini-3.5-flash";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const DIAS_TREINO_PADRAO = ["seg", "ter", "qua", "qui", "sex"];
const uid = () => Math.random().toString(36).slice(2, 10);

function dataUrlParaPart(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) throw new Error("Formato de arquivo inesperado (esperava data URL base64).");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

function getModel(responseSchema) {
  if (!ai) {
    throw new Error("Leitura por IA não configurada (defina NEXT_PUBLIC_RECAPTCHA_SITE_KEY para ativar o Firebase AI Logic).");
  }
  return getGenerativeModel(ai, {
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json", responseSchema },
  });
}

const refeicoesSchema = Schema.object({
  properties: {
    refeicoes: Schema.array({
      items: Schema.object({
        properties: {
          dia: Schema.string(),
          horario: Schema.string(),
          titulo: Schema.string(),
          descricao: Schema.string(),
        },
      }),
    }),
  },
});

const PROMPT_DIETA = `Você recebe um plano alimentar/dieta em PDF, que pode vir em qualquer
formato (tabelas, listas com marcadores, texto livre), de diferentes apps
ou nutricionistas. Extraia cada refeição do documento.

Para cada refeição, retorne:
- "dia": se o documento indicar explicitamente um dia da semana para essa
  refeição (ex: "Segunda-feira", "Dia 2"), use a abreviação em português
  minúscula: dom, seg, ter, qua, qui, sex ou sab. Se o plano for único
  (vale para todos os dias, sem indicação de dia da semana), deixe "" (
  string vazia).
- "horario": o horário da refeição no formato 24h "HH:MM". Se não houver
  horário explícito, estime um horário plausível para o tipo de refeição
  (café da manhã, almoço, lanche, jantar, ceia) e a ordem em que aparece.
- "titulo": o nome da refeição (ex: "Café da Manhã", "Almoço").
- "descricao": um resumo curto e legível do que comer nessa refeição,
  em português, juntando os alimentos/opções e qualquer observação do
  documento (substituições, quantidades, dicas). Não inclua valores de
  macronutrientes (CHO/LIP/PTN/Kcal) nem tabelas nutricionais.

Ignore cabeçalhos, rodapés repetidos, resumo nutricional diário e
qualquer conteúdo que não seja uma refeição concreta.`;

export async function analisarPlanoAlimentar(dataUrl) {
  const model = getModel(refeicoesSchema);
  const part = dataUrlParaPart(dataUrl);
  const result = await model.generateContent([PROMPT_DIETA, part]);
  const json = JSON.parse(result.response.text());
  const refeicoes = Array.isArray(json.refeicoes) ? json.refeicoes : [];

  const comDia = refeicoes.filter((r) => r.dia && DIAS.includes(r.dia));
  const semDia = refeicoes.filter((r) => !r.dia || !DIAS.includes(r.dia));

  const dias = {};
  const paraItem = (r) => ({
    id: uid(),
    horario: r.horario || "12:00",
    opcoes: r.titulo ? `${r.titulo} — ${r.descricao || ""}`.trim() : (r.descricao || ""),
    notificar: true,
  });

  if (comDia.length) {
    comDia.forEach((r) => { if (!dias[r.dia]) dias[r.dia] = []; dias[r.dia].push(paraItem(r)); });
  } else if (semDia.length) {
    const lista = semDia.map(paraItem);
    DIAS.forEach((d) => { dias[d] = lista.map((r) => ({ ...r, id: uid() })); });
  }
  return { dias, total: refeicoes.length };
}

const fichaSchema = Schema.object({
  properties: {
    exercicios: Schema.array({
      items: Schema.object({
        properties: {
          dia: Schema.string(),
          nome: Schema.string(),
          series: Schema.string(),
        },
      }),
    }),
  },
});

const PROMPT_FICHA = `Você recebe uma ficha de treino/exercícios em PDF, que pode vir em
qualquer formato (tabelas, listas, texto livre), de diferentes apps ou
personal trainers. Extraia cada exercício do documento.

Para cada exercício, retorne:
- "dia": se a ficha indicar explicitamente um dia de treino (ex: "Treino
  A - Segunda", "Dia 3"), use a abreviação em português minúscula: dom,
  seg, ter, qua, qui, sex ou sab. Se não houver indicação de dia (lista
  única de exercícios), deixe "" (string vazia).
- "nome": o nome do exercício.
- "series": séries x repetições ou outra prescrição de volume (ex:
  "4x10", "3x12-15", "3x30s"). Deixe "" se não informado.

Ignore cabeçalhos, rodapés e qualquer conteúdo que não seja um exercício
concreto.`;

export async function analisarFichaTreino(dataUrl) {
  const model = getModel(fichaSchema);
  const part = dataUrlParaPart(dataUrl);
  const result = await model.generateContent([PROMPT_FICHA, part]);
  const json = JSON.parse(result.response.text());
  const exercicios = Array.isArray(json.exercicios) ? json.exercicios : [];

  const comDia = exercicios.filter((e) => e.dia && DIAS.includes(e.dia));
  const semDia = exercicios.filter((e) => !e.dia || !DIAS.includes(e.dia));

  const dias = {};
  const paraItem = (e) => ({ id: uid(), nome: e.nome || "", series: e.series || "" });

  if (comDia.length) {
    comDia.forEach((e) => { if (!dias[e.dia]) dias[e.dia] = []; dias[e.dia].push(paraItem(e)); });
  } else if (semDia.length) {
    const lista = semDia.map(paraItem);
    const porDia = Math.ceil(lista.length / DIAS_TREINO_PADRAO.length);
    DIAS_TREINO_PADRAO.forEach((d, i) => {
      const chunk = lista.slice(i * porDia, (i + 1) * porDia);
      if (chunk.length) dias[d] = chunk;
    });
  }
  return { dias, total: exercicios.length };
}
