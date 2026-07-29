"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dumbbell, Droplets, UtensilsCrossed, Home as HomeIcon, Plus, Trash2, Check, Play, Pause,
  RotateCcw, TrendingUp, Upload, Bell, BellOff, X, ChevronRight, LogOut,
  FileText, Image as ImageIcon, Settings2, CalendarClock, Repeat, CalendarDays,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/lib/AuthProvider";
import { loadField, saveField, loadPerfilAgua, savePerfilAgua, saveFcmToken } from "@/lib/db";
import { gerarHorarios } from "@/lib/water";
import { ativarPushNotifications } from "@/lib/messaging";

const K = {
  ficha: "ficha-treino", checkins: "checkins", exStatus: "exercicio-status",
  pesoEvo: "evolucao-peso", aguaLog: "agua-log", refeicoes: "dieta-refeicoes",
  dietaArquivo: "dieta-arquivo", fichaArquivo: "ficha-arquivo", timerCfg: "rest-timer-config", tarefas: "casa-tarefas",
  notificarDieta: "dieta-notificar", notificarCasa: "casa-notificar",
};

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const DIA_LABEL = { dom: "Domingo", seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado" };
const todayKey = () => new Date().toISOString().slice(0, 10);
const todayDia = () => DIAS[new Date().getDay()];
const uid = () => Math.random().toString(36).slice(2, 10);

const DICAS_EXERCICIO = [
  { m: ["agachamento"], d: "Desça controlando o quadril para trás, joelhos alinhados com a ponta dos pés, peito aberto." },
  { m: ["supino"], d: "Escápulas retraídas, barra desce até tocar levemente o peito sem quicar." },
  { m: ["terra"], d: "Costas neutras, barra próxima às canelas, estenda quadril e joelho ao mesmo tempo." },
  { m: ["remada"], d: "Puxe levando o cotovelo para trás, aproxime as escápulas no final do movimento." },
  { m: ["rosca"], d: "Cotovelos fixos ao lado do corpo, suba controlado sem usar impulso do ombro." },
  { m: ["desenvolvimento", "ombro"], d: "Evite hiperestender a lombar, sem travar bruscamente o cotovelo no topo." },
  { m: ["leg press"], d: "Não deixe o joelho ultrapassar demais a ponta do pé, lombar apoiada no banco." },
  { m: ["puxada", "pulldown"], d: "Leve os cotovelos para baixo e para trás, sem jogar o corpo." },
  { m: ["stiff"], d: "Joelhos levemente flexionados e fixos, desça pela quadril." },
  { m: ["panturrilha"], d: "Amplitude completa, pausa breve no topo do movimento." },
];
const dicaPara = (nome) => {
  const n = (nome || "").toLowerCase();
  const f = DICAS_EXERCICIO.find((x) => x.m.some((k) => n.includes(k)));
  return f ? f.d : "Priorize a execução controlada e evite compensar com outras articulações.";
};

const normalizeStr = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const DIA_ALIASES = {
  dom: "dom", domingo: "dom",
  seg: "seg", segunda: "seg", "segunda-feira": "seg",
  ter: "ter", terca: "ter", "terca-feira": "ter",
  qua: "qua", quarta: "qua", "quarta-feira": "qua",
  qui: "qui", quinta: "qui", "quinta-feira": "qui",
  sex: "sex", sexta: "sex", "sexta-feira": "sex",
  sab: "sab", sabado: "sab",
};
const matchDia = (linha) => DIA_ALIASES[normalizeStr(linha).replace(/:$/, "")] || null;

function parseLinhaExercicio(linha) {
  let nome = linha, series = "";
  const partesTraco = linha.split(/\s+-\s+|\s*\|\s*/);
  if (partesTraco.length >= 2) {
    nome = partesTraco[0].trim(); series = partesTraco.slice(1).join(" ").trim();
  } else {
    const m = linha.match(/^(.*?)[,;]\s*(\d+\s*[xX]\s*\d+.*)$/) || linha.match(/^(.*?)\s+(\d+\s*[xX]\s*\d+)\s*$/);
    if (m) { nome = m[1].trim(); series = m[2].trim(); }
  }
  return { nome, series };
}

const DIAS_TREINO_PADRAO = ["seg", "ter", "qua", "qui", "sex"];

// Aceita um arquivo de texto com o nome do dia em uma linha (ex: "Segunda")
// seguido pelos exercícios daquele dia, um por linha (ex: "Agachamento - 4x10"),
// ou linhas no formato CSV "dia,exercicio,series". Se o arquivo não indicar
// nenhum dia, os exercícios são distribuídos automaticamente entre seg-sex.
function parseFichaArquivo(texto) {
  const linhas = texto.split(/\r?\n/);
  const out = {};
  const soltos = [];
  let atual = null;
  for (const raw of linhas) {
    const linha = raw.trim();
    if (!linha) continue;
    const dia = matchDia(linha);
    if (dia) { atual = dia; if (!out[atual]) out[atual] = []; continue; }
    if (!atual) {
      const partes = linha.split(/[,;]/).map((p) => p.trim());
      if (partes.length >= 2) {
        const d = matchDia(partes[0]);
        if (d) { if (!out[d]) out[d] = []; out[d].push({ id: uid(), nome: partes[1] || "", series: partes[2] || "" }); continue; }
      }
      const { nome, series } = parseLinhaExercicio(linha);
      if (nome) soltos.push({ id: uid(), nome, series });
      continue;
    }
    const { nome, series } = parseLinhaExercicio(linha);
    if (nome) out[atual].push({ id: uid(), nome, series });
  }
  if (Object.keys(out).length === 0 && soltos.length > 0) {
    const porDia = Math.ceil(soltos.length / DIAS_TREINO_PADRAO.length);
    DIAS_TREINO_PADRAO.forEach((d, i) => {
      const chunk = soltos.slice(i * porDia, (i + 1) * porDia);
      if (chunk.length) out[d] = chunk;
    });
    return { dias: out, distribuido: true };
  }
  return { dias: out, distribuido: false };
}

function parseLinhaRefeicao(linha) {
  const m = linha.match(/^(\d{1,2}):?(\d{2})\s*[-–:|,]?\s*(.*)$/);
  if (!m) return null;
  const horario = `${m[1].padStart(2, "0")}:${m[2]}`;
  const opcoes = m[3].trim();
  if (!opcoes) return null;
  return { id: uid(), horario, opcoes, notificar: true };
}

// Aceita um arquivo de texto com uma refeição por linha, começando pelo
// horário (ex: "07:00 - Ovos e aveia" ou "12:00, Frango com batata doce").
// Se o arquivo indicar dias (ex: "Segunda" seguido das refeições daquele
// dia), as refeições são organizadas por dia da semana. Caso contrário, a
// mesma lista de refeições é aplicada automaticamente a todos os dias.
function parseDietaSimples(texto) {
  const linhas = texto.split(/\r?\n/);
  const out = {};
  const soltas = [];
  let atual = null;
  for (const raw of linhas) {
    const linha = raw.trim();
    if (!linha) continue;
    const dia = matchDia(linha);
    if (dia) { atual = dia; if (!out[atual]) out[atual] = []; continue; }
    const refeicao = parseLinhaRefeicao(linha);
    if (!refeicao) continue;
    if (atual) out[atual].push(refeicao);
    else soltas.push(refeicao);
  }
  if (Object.keys(out).length === 0 && soltas.length > 0) {
    DIAS.forEach((d) => { out[d] = soltas.map((r) => ({ ...r, id: uid() })); });
    return { dias: out, total: soltas.length };
  }
  return { dias: out, total: soltas.length };
}

const ORDEM_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

function limparLinhaPdf(l) {
  return l.replace(/\s{2,}/g, " ").trim();
}

// Reconhece o formato de "plano alimentar" estruturado, comum em PDFs
// exportados por softwares de nutrição: blocos por refeição com nome +
// horário (ex: "Café da Manhã 09:00"), lista de alimentos, uma linha
// "Total" e uma "Observação" com o resumo em texto livre — usado como a
// descrição da refeição (mais legível que listar os alimentos). Se o
// arquivo tiver múltiplos "Plano : Dia N", cada dia é distribuído para um
// dia da semana (seg, ter, ...). Com um único dia (ou nenhuma marcação de
// dia), a mesma lista de refeições é aplicada a todos os dias da semana.
function parsePlanoAlimentarEstruturado(texto) {
  const linhas = texto.split(/\r?\n/).map(limparLinhaPdf);
  const cabecalho = linhas.find((l) => l.length > 0) || null;

  const porDiaBruto = {};
  let diaAtual = "_unico";
  let ref = null;

  const commit = () => {
    if (ref && ref.horario) {
      const opcoes = ref.obs.join(" ").trim() || ref.itens.join(", ");
      if (opcoes) {
        if (!porDiaBruto[diaAtual]) porDiaBruto[diaAtual] = [];
        porDiaBruto[diaAtual].push({ id: uid(), horario: ref.horario, opcoes, notificar: true });
      }
    }
    ref = null;
  };

  for (const linha of linhas) {
    if (!linha) { if (ref) ref.emObs = false; continue; }
    if (cabecalho && linha === cabecalho) continue;
    if (/^Dados Nutricionais Totais/i.test(linha)) { commit(); break; }
    const diaM = linha.match(/^Plano\s*:?\s*Dia\s*(\d+)/i);
    if (diaM) { commit(); diaAtual = diaM[1]; continue; }
    const mealM = linha.match(/^([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ ]{1,39})\s+(\d{1,2}):(\d{2})(.*)$/);
    if (mealM) {
      const resto = mealM[4].trim();
      if (resto === "" || /^CHO\b/i.test(resto)) {
        commit();
        ref = { horario: `${mealM[2].padStart(2, "0")}:${mealM[3]}`, itens: [], obs: [], emObs: false };
        continue;
      }
    }
    if (!ref) continue;
    if (/^Total\b/i.test(linha)) continue;
    if (/^Observa[cç][aã]o\b/i.test(linha)) { ref.emObs = true; continue; }
    if (ref.emObs) { ref.obs.push(linha); continue; }
    const nomeItem = linha.split(/\s+-\s+/)[0].trim();
    if (nomeItem.length > 1) ref.itens.push(nomeItem);
  }
  commit();

  const chaves = Object.keys(porDiaBruto);
  const dias = {};
  let total = 0;
  if (chaves.length <= 1) {
    const lista = porDiaBruto[chaves[0]] || [];
    total = lista.length;
    if (total) DIAS.forEach((d) => { dias[d] = lista.map((r) => ({ ...r, id: uid() })); });
  } else {
    chaves.sort((a, b) => Number(a) - Number(b)).forEach((chave, i) => {
      const d = ORDEM_SEMANA[i % ORDEM_SEMANA.length];
      if (!dias[d]) dias[d] = [];
      dias[d].push(...porDiaBruto[chave].map((r) => ({ ...r, id: uid() })));
      total += porDiaBruto[chave].length;
    });
  }
  return { dias, total };
}

// Ponto de entrada único: tenta reconhecer o formato estruturado de plano
// alimentar (PDFs de nutricionista) e, se não encontrar nada, cai para o
// formato simples de uma refeição por linha.
function parseDietaArquivo(texto) {
  const estruturado = parsePlanoAlimentarEstruturado(texto);
  if (estruturado.total > 0) return estruturado;
  return parseDietaSimples(texto);
}

// Tenta abrir a busca direto no app do TikTok (via URL scheme do app);
// se o app não estiver instalado (ou o navegador ignorar o scheme), cai
// para o site do TikTok após um tempo curto. O usuário não perde a
// funcionalidade caso o app não abra — só não tem a preferência pelo app.
function abrirTiktokBusca(termo) {
  const q = encodeURIComponent(termo);
  const appUrl = `tiktok://search?q=${q}`;
  const webUrl = `https://www.tiktok.com/search?q=${q}`;
  let saiuDaPagina = false;
  const marcarSaida = () => { saiuDaPagina = true; };
  document.addEventListener("visibilitychange", marcarSaida, { once: true });
  window.addEventListener("blur", marcarSaida, { once: true });
  window.location.href = appUrl;
  setTimeout(() => {
    document.removeEventListener("visibilitychange", marcarSaida);
    window.removeEventListener("blur", marcarSaida);
    if (!saiuDaPagina) window.location.href = webUrl;
  }, 1200);
}

const RECEITAS = [
  { nome: "Frango desfiado com batata doce", desc: "Proteína magra + carboidrato de baixo índice glicêmico." },
  { nome: "Omelete de claras com espinafre", desc: "Rápida, rica em proteína, ótima para o café da manhã." },
  { nome: "Salada de atum com abacate", desc: "Gorduras boas + proteína, praticamente sem carboidrato." },
  { nome: "Wrap de alface com carne moída", desc: "Substitui o pão por folha, reduz carboidrato refinado." },
  { nome: "Iogurte grego com frutas vermelhas", desc: "Doce natural, rico em proteína." },
  { nome: "Overnight oats com whey", desc: "Deixa pronto na geladeira, ótimo pra pouco tempo." },
];

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch {}
}
function notify(title, body) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "/icon-192.png" }); } catch {}
  }
}

// Dados antigos podem ter vindo em formatos legados: refeições como lista
// única (aplicada a todos os dias) e tarefas com tipos antigos
// ("personalizado" -> "semanal", "prazo" -> "pontual").
function migrarRefeicoes(rf) {
  if (Array.isArray(rf)) {
    const out = {};
    DIAS.forEach((d) => { out[d] = rf.map((r) => ({ ...r })); });
    return out;
  }
  return rf || {};
}
function migrarTarefas(ts) {
  return (ts || []).map((t) => {
    if (t.tipo === "personalizado") return { ...t, tipo: "semanal" };
    if (t.tipo === "prazo") {
      const { prazoData, ...resto } = t;
      return { ...resto, tipo: "pontual", data: prazoData || todayKey() };
    }
    return t;
  });
}

export default function Dashboard() {
  const router = useRouter();
  const { user, loadingAuth, signOut } = useAuth();
  const [tab, setTab] = useState("agua");
  const [loaded, setLoaded] = useState(false);
  const [perfil, setPerfil] = useState(null);

  const [ficha, setFicha] = useState({});
  const [checkins, setCheckins] = useState([]);
  const [exStatus, setExStatus] = useState({});
  const [pesoEvo, setPesoEvo] = useState([]);
  const [aguaLog, setAguaLog] = useState({});
  const [refeicoes, setRefeicoes] = useState({});
  const [dietaArquivo, setDietaArquivo] = useState(null);
  const [fichaArquivo, setFichaArquivo] = useState(null);
  const [timerCfg, setTimerCfg] = useState({ segundos: 90 });
  const [tarefas, setTarefas] = useState([]);
  const [notificarDieta, setNotificarDieta] = useState(true);
  const [notificarCasa, setNotificarCasa] = useState(true);
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [toast, setToast] = useState(null);
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    const e = user;
    if (!loadingAuth && !e) { router.replace("/login"); return; }
    if (!e) return;
    (async () => {
      const p = await loadPerfilAgua(e.uid);
      if (!p) { router.replace("/questionario"); return; }
      setPerfil(p);
      const [f, c, es, pe, al, rf, da, fa, tc, tf, nd, nc] = await Promise.all([
        loadField(e.uid, K.ficha, {}), loadField(e.uid, K.checkins, []), loadField(e.uid, K.exStatus, {}),
        loadField(e.uid, K.pesoEvo, []), loadField(e.uid, K.aguaLog, {}), loadField(e.uid, K.refeicoes, {}),
        loadField(e.uid, K.dietaArquivo, null), loadField(e.uid, K.fichaArquivo, null),
        loadField(e.uid, K.timerCfg, { segundos: 90 }), loadField(e.uid, K.tarefas, []),
        loadField(e.uid, K.notificarDieta, true), loadField(e.uid, K.notificarCasa, true),
      ]);
      setFicha(f); setCheckins(c); setExStatus(es); setPesoEvo(pe);
      setAguaLog(al); setRefeicoes(migrarRefeicoes(rf)); setDietaArquivo(da); setFichaArquivo(fa); setTimerCfg(tc); setTarefas(migrarTarefas(tf));
      setNotificarDieta(nd); setNotificarCasa(nc);
      setLoaded(true);
    })();
  }, [user, loadingAuth, router]);

  useEffect(() => { if (loaded && user) saveField(user.uid, K.ficha, ficha); }, [ficha, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.checkins, checkins); }, [checkins, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.exStatus, exStatus); }, [exStatus, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.pesoEvo, pesoEvo); }, [pesoEvo, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.aguaLog, aguaLog); }, [aguaLog, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.refeicoes, refeicoes); }, [refeicoes, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.dietaArquivo, dietaArquivo); }, [dietaArquivo, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.fichaArquivo, fichaArquivo); }, [fichaArquivo, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.timerCfg, timerCfg); }, [timerCfg, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.tarefas, tarefas); }, [tarefas, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.notificarDieta, notificarDieta); }, [notificarDieta, loaded]);
  useEffect(() => { if (loaded && user) saveField(user.uid, K.notificarCasa, notificarCasa); }, [notificarCasa, loaded]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const horariosAgua = useMemo(() => perfil ? gerarHorarios(perfil.inicio, perfil.fim, perfil.intervaloH) : [], [perfil]);
  const mlPorLembrete = horariosAgua.length ? Math.round((perfil?.metaMl || 0) / horariosAgua.length) : 0;

  // Lembretes locais (enquanto o app está aberto) — o envio "de verdade" com
  // app fechado é feito pela Cloud Function `enviarLembretes` no servidor.
  useEffect(() => {
    if (!perfil) return;
    const iv = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const dayTag = todayKey();
      if (perfil.notificarAgua !== false) {
        horariosAgua.forEach((h) => {
          const key = `agua-${dayTag}-${h}`;
          if (h === hhmm && !notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            notify("Hora de beber água 💧", `Beba aprox. ${mlPorLembrete}ml agora.`);
            showToast(`💧 Lembrete: beba ~${mlPorLembrete}ml de água agora.`);
          }
        });
      }
      if (notificarDieta) {
        (refeicoes[todayDia()] || []).forEach((r) => {
          if (r.notificar === false) return;
          const key = `ref-${dayTag}-${r.id}`;
          if (r.horario === hhmm && !notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            notify("Hora da refeição 🍽️", r.opcoes || "Confira suas opções da dieta.");
            showToast(`🍽️ ${r.horario} — ${r.opcoes || "hora da refeição"}`);
          }
        });
      }
      if (notificarCasa) {
        tarefas.forEach((t) => {
          if (!t.notificar || !t.horario) return;
          if (!tarefaEhHoje(t) || tarefaConcluidaHoje(t)) return;
          const key = `tarefa-${dayTag}-${t.id}`;
          if (t.horario === hhmm && !notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            notify("Tarefa pendente 🏠", t.titulo);
            showToast(`🏠 ${t.horario} — ${t.titulo}`);
          }
        });
      }
    }, 20000);
    return () => clearInterval(iv);
  }, [horariosAgua, mlPorLembrete, refeicoes, tarefas, perfil, notificarDieta, notificarCasa]);

  const pedirPermissao = async () => {
    const r = await ativarPushNotifications();
    setNotifPerm(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    if (r?.ok && r.token && user) { await saveFcmToken(user.uid, r.token); showToast("Notificações ativadas ✅"); }
    else if (r && !r.ok) showToast(`Não foi possível ativar (${r.motivo}).`);
  };

  const toggleNotificarAgua = async () => {
    if (!user || !perfil) return;
    const novo = { ...perfil, notificarAgua: perfil.notificarAgua === false, horarios: horariosAgua, mlPorLembrete, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    setPerfil(novo);
    await savePerfilAgua(user.uid, novo);
    if (novo.notificarAgua) await pedirPermissao();
  };

  const sair = async () => { await signOut(); router.replace("/login"); };

  const TABS = [
    { id: "academia", label: "Academia", icon: Dumbbell, accent: "#E8462B" },
    { id: "agua", label: "Água", icon: Droplets, accent: "#1D7A6B" },
    { id: "dieta", label: "Dieta", icon: UtensilsCrossed, accent: "#C9A227" },
    { id: "casa", label: "Casa", icon: HomeIcon, accent: "#6E7BC9" },
  ];
  const activeAccent = TABS.find((t) => t.id === tab).accent;

  if (!perfil) return null;

  return (
    <div className="min-h-screen w-full relative overflow-hidden" style={{ background: "#14181C" }}>
      <div className="blob" style={{ position: "absolute", top: -80, right: -60, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle at 40% 40%, ${activeAccent}, transparent 70%)`, opacity: 0.22, filter: "blur(16px)", pointerEvents: "none", transition: "background 0.4s" }} />

      <div className="px-5 pt-6 pb-4 flex items-start justify-between relative" style={{ borderBottom: "1px solid #262c32" }}>
        <div>
          <p className="font-display uppercase text-[11px] tracking-[0.25em]" style={{ color: "#7A828A" }}>{user?.email}</p>
          <h1 className="font-display text-3xl text-white mt-1">Rotina<span style={{ color: activeAccent, transition: "color .3s" }}>.</span></h1>
        </div>
        <button onClick={sair} className="flex items-center gap-1 font-mono text-xs px-3 py-1.5 rounded-full btn-press" style={{ color: "#7A828A", border: "1px solid #262c32" }}>
          <LogOut size={13} /> sair
        </button>
      </div>

      <div className="flex px-3 pt-3 gap-1 relative">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-t-2xl transition-all duration-200"
              style={{ background: active ? "#EDEFEA" : "transparent" }}>
              <Icon size={18} color={active ? t.accent : "#7A828A"} strokeWidth={2.2} className={active ? "check-pop" : ""} />
              <span className="font-display text-[10px] uppercase tracking-wide" style={{ color: active ? "#1C2320" : "#7A828A" }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-3 mb-6 rounded-b-3xl rounded-tl-3xl p-4 relative" style={{ background: "#EDEFEA", minHeight: "70vh" }}>
        {!loaded ? (
          <p className="text-center py-20 font-mono text-sm pulse-soft" style={{ color: "#7A828A" }}>carregando…</p>
        ) : (
          <div key={tab} className="tab-panel">
            {tab === "academia" && (
              <Academia {...{ ficha, setFicha, checkins, setCheckins, exStatus, setExStatus, pesoEvo, setPesoEvo, timerCfg, setTimerCfg, fichaArquivo, setFichaArquivo, showToast }} />
            )}
            {tab === "agua" && (
              <Agua {...{ perfil, aguaLog, setAguaLog, horariosAgua, mlPorLembrete, notifPerm, pedirPermissao, router, toggleNotificarAgua }} />
            )}
            {tab === "dieta" && (
              <Dieta {...{ refeicoes, setRefeicoes, dietaArquivo, setDietaArquivo, notificarDieta, setNotificarDieta, notifPerm, pedirPermissao, showToast }} />
            )}
            {tab === "casa" && (
              <Casa {...{ tarefas, setTarefas, notificarCasa, setNotificarCasa, notifPerm, pedirPermissao, showToast }} />
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-2xl shadow-lg font-mono text-sm z-50 pop-in" style={{ background: "#1C2320", color: "#EDEFEA", maxWidth: "90vw", wordBreak: "break-word", overflowWrap: "anywhere" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- Academia ---------------- */
function Academia({ ficha, setFicha, checkins, setCheckins, exStatus, setExStatus, pesoEvo, setPesoEvo, timerCfg, setTimerCfg, fichaArquivo, setFichaArquivo, showToast }) {
  const [sub, setSub] = useState("hoje");
  const [diaEdit, setDiaEdit] = useState(todayDia());
  const [lendoFichaIA, setLendoFichaIA] = useState(false);
  const fichaFileRef = useRef(null);

  const aplicarFichaImportada = (importada, origem) => {
    const dias = Object.keys(importada);
    if (!dias.length) { showToast("Não encontramos exercícios reconhecíveis nesse arquivo."); return; }
    setFicha((f) => ({ ...f, ...importada }));
    showToast(origem === "ia"
      ? `Ficha lida por IA: ${dias.length} dia(s) atualizados com os exercícios do arquivo.`
      : `Ficha importada: ${dias.length} dia(s) atualizados com os exercícios do arquivo.`);
  };

  const onFichaFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const reader = new FileReader();
    reader.onload = async () => {
      const conteudo = String(reader.result);
      setFichaArquivo({ nome: file.name, conteudo });
      if (isPdf) {
        setLendoFichaIA(true);
        try {
          const { analisarFichaTreino } = await import("@/lib/ai");
          const { dias } = await analisarFichaTreino(conteudo);
          aplicarFichaImportada(dias, "ia");
        } catch (err) {
          console.error("Erro ao ler PDF da ficha", err);
          const motivo = (err && err.message ? err.message : String(err)).slice(0, 320);
          showToast(`Não conseguimos ler esse PDF automaticamente (${motivo}). O arquivo foi salvo para consulta.`);
        } finally {
          setLendoFichaIA(false);
        }
      } else {
        const { dias } = parseFichaArquivo(conteudo);
        aplicarFichaImportada(dias, "regras");
      }
    };
    if (isPdf) reader.readAsDataURL(file); else reader.readAsText(file);
    e.target.value = "";
  };
  const removeFichaArquivo = () => { setFichaArquivo(null); showToast("Arquivo da ficha removido."); };
  const jaCheckouHoje = checkins.includes(todayKey());
  const doCheckin = () => {
    if (jaCheckouHoje) { showToast("Você já fez check-in hoje 💪"); return; }
    setCheckins((c) => [...c, todayKey()]);
    showToast("Check-in registrado! Bom treino 🔥");
  };
  const exerciciosHoje = ficha[todayDia()] || [];
  const statusHoje = exStatus[todayKey()] || {};
  const toggleEx = (exId) => setExStatus((s) => ({ ...s, [todayKey()]: { ...(s[todayKey()] || {}), [exId]: !((s[todayKey()] || {})[exId]) } }));
  const addExercicio = (dia) => {
    const nome = prompt("Nome do exercício:");
    if (!nome) return;
    const series = prompt("Séries x repetições (ex: 4x10):", "3x12") || "";
    setFicha((f) => ({ ...f, [dia]: [...(f[dia] || []), { id: uid(), nome, series }] }));
  };
  const removeExercicio = (dia, id) => setFicha((f) => ({ ...f, [dia]: (f[dia] || []).filter((e) => e.id !== id) }));

  const SUBTABS = [{ id: "hoje", label: "Hoje" }, { id: "ficha", label: "Ficha" }, { id: "checkin", label: "Check-in" }, { id: "timer", label: "Descanso" }, { id: "evolucao", label: "Evolução" }];

  return (
    <div>
      <SubNav items={SUBTABS} value={sub} onChange={setSub} accent="#E8462B" />
      {sub === "hoje" && (
        <div className="mt-4 space-y-3">
          <p className="font-mono text-xs" style={{ color: "#5C6570" }}>{DIA_LABEL[todayDia()].toUpperCase()} · TREINO DO DIA</p>
          {exerciciosHoje.length === 0 ? <EmptyState text="Nenhum exercício cadastrado para hoje. Vá em 'Ficha' e adicione o treino do dia." /> : exerciciosHoje.map((ex) => (
            <div key={ex.id} className="card-white p-3">
              <button onClick={() => toggleEx(ex.id)} className="flex items-start gap-3 text-left w-full">
                <span className={"mt-0.5 flex items-center justify-center w-6 h-6 rounded-full shrink-0" + (statusHoje[ex.id] ? " check-pop" : "")} style={{ background: statusHoje[ex.id] ? "#E8462B" : "transparent", border: "2px solid #E8462B" }}>
                  {statusHoje[ex.id] && <Check size={14} color="#fff" strokeWidth={3} />}
                </span>
                <span>
                  <span className="block font-semibold" style={{ color: "#1C2320", textDecoration: statusHoje[ex.id] ? "line-through" : "none" }}>{ex.nome}</span>
                  <span className="block font-mono text-xs mt-0.5" style={{ color: "#7A828A" }}>{ex.series}</span>
                </span>
              </button>
              <p className="text-xs mt-2 pl-9" style={{ color: "#5C6570" }}>💡 {dicaPara(ex.nome)}</p>
              <RegistrarPeso exNome={ex.nome} setPesoEvo={setPesoEvo} />
            </div>
          ))}
        </div>
      )}
      {sub === "ficha" && (
        <div className="mt-4">
          <input ref={fichaFileRef} type="file" className="hidden" onChange={onFichaFile} accept=".txt,.csv,.md,.pdf" />
          <button onClick={() => fichaFileRef.current.click()} disabled={lendoFichaIA} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-display text-xs uppercase tracking-wide text-white btn-press" style={{ background: "#E8462B", opacity: lendoFichaIA ? 0.6 : 1 }}>
            <Upload size={15} /> {lendoFichaIA ? "Lendo com IA…" : "Importar ficha de arquivo"}
          </button>
          <p className="text-[11px] mt-1.5 mb-3" style={{ color: "#7A828A" }}>
            Arquivo .txt/.csv/.md com o nome do dia em uma linha (ex: "Segunda") seguido dos exercícios, um por linha ("Agachamento - 4x10"), ou um PDF de ficha de treino em qualquer formato — lido por IA, que identifica os exercícios e os dias automaticamente. Os dias encontrados no arquivo substituem os exercícios já cadastrados.
          </p>
          {fichaArquivo && (
            <div className="mb-3 card-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} color="#5C6570" className="shrink-0" />
                  <span className="font-mono text-xs truncate" style={{ color: "#1C2320" }}>{fichaArquivo.nome}</span>
                </div>
                <button onClick={removeFichaArquivo} className="shrink-0" title="Excluir arquivo anexado"><Trash2 size={16} color="#B0473A" /></button>
              </div>
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {DIAS.map((d) => (
              <button key={d} onClick={() => setDiaEdit(d)} className="font-mono text-xs px-3 py-1.5 rounded-full shrink-0 btn-press" style={{ background: diaEdit === d ? "#1C2320" : "#fff", color: diaEdit === d ? "#fff" : "#5C6570", border: "1px solid #DCDFD8" }}>
                {DIA_LABEL[d].slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {(ficha[diaEdit] || []).map((ex) => (
              <div key={ex.id} className="flex items-center justify-between card-white p-3">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#1C2320" }}>{ex.nome}</p>
                  <p className="font-mono text-xs" style={{ color: "#7A828A" }}>{ex.series}</p>
                </div>
                <button onClick={() => removeExercicio(diaEdit, ex.id)}><Trash2 size={16} color="#B0473A" /></button>
              </div>
            ))}
            <button onClick={() => addExercicio(diaEdit)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-display text-sm uppercase tracking-wide btn-press" style={{ border: "2px dashed #C7CBC2", color: "#5C6570" }}>
              <Plus size={16} /> Adicionar exercício em {DIA_LABEL[diaEdit]}
            </button>
          </div>
        </div>
      )}
      {sub === "checkin" && (
        <div className="mt-4">
          <button onClick={doCheckin} className="w-full py-4 rounded-full font-display uppercase tracking-wide text-white btn-press" style={{ background: jaCheckouHoje ? "#8AA090" : "#1D7A6B" }}>
            {jaCheckouHoje ? "✓ Check-in feito hoje" : "Fazer check-in de hoje"}
          </button>
          <p className="font-mono text-xs mt-4 mb-2" style={{ color: "#5C6570" }}>ÚLTIMOS 30 DIAS · {checkins.length} CHECK-INS NO TOTAL</p>
          <PunchCard checkins={checkins} />
        </div>
      )}
      {sub === "timer" && <TimerDescanso timerCfg={timerCfg} setTimerCfg={setTimerCfg} />}
      {sub === "evolucao" && <Evolucao pesoEvo={pesoEvo} />}
    </div>
  );
}

function RegistrarPeso({ exNome, setPesoEvo }) {
  const [open, setOpen] = useState(false); const [peso, setPeso] = useState(""); const [reps, setReps] = useState("");
  const salvar = () => { if (!peso) return; setPesoEvo((p) => [...p, { id: uid(), exNome, data: todayKey(), peso: parseFloat(peso), reps }]); setPeso(""); setReps(""); setOpen(false); };
  return (
    <div className="pl-9 mt-2">
      {!open ? (
        <button onClick={() => setOpen(true)} className="font-mono text-xs flex items-center gap-1" style={{ color: "#E8462B" }}><TrendingUp size={12} /> Registrar peso usado</button>
      ) : (
        <div className="flex gap-2 items-center mt-1">
          <input value={peso} onChange={(e) => setPeso(e.target.value)} type="number" placeholder="kg" className="w-16 px-2 py-1 rounded-full font-mono text-xs" style={{ border: "1px solid #C7CBC2" }} />
          <input value={reps} onChange={(e) => setReps(e.target.value)} placeholder="reps" className="w-16 px-2 py-1 rounded-full font-mono text-xs" style={{ border: "1px solid #C7CBC2" }} />
          <button onClick={salvar} className="px-3 py-1 rounded-full text-xs text-white btn-press" style={{ background: "#E8462B" }}>Salvar</button>
          <button onClick={() => setOpen(false)}><X size={14} color="#7A828A" /></button>
        </div>
      )}
    </div>
  );
}

function PunchCard({ checkins }) {
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {days.map((d, i) => { const on = checkins.includes(d); return (
        <div key={d} title={d} className="aspect-square rounded-full flex items-center justify-center" style={{ background: on ? "#1D7A6B" : "#fff", border: "1px solid " + (on ? "#1D7A6B" : "#DCDFD8"), animation: on ? `checkPop .3s cubic-bezier(.34,1.56,.64,1) both` : "none", animationDelay: `${i * 8}ms` }}>
          {on && <Check size={10} color="#fff" strokeWidth={3} />}
        </div>
      ); })}
    </div>
  );
}

function TimerDescanso({ timerCfg, setTimerCfg }) {
  const [restante, setRestante] = useState(timerCfg.segundos);
  const [rodando, setRodando] = useState(false);
  const ivRef = useRef(null);
  useEffect(() => { if (!rodando) setRestante(timerCfg.segundos); }, [timerCfg.segundos]);
  useEffect(() => {
    if (rodando) {
      ivRef.current = setInterval(() => setRestante((r) => { if (r <= 1) { clearInterval(ivRef.current); setRodando(false); beep(); return 0; } return r - 1; }), 1000);
    }
    return () => clearInterval(ivRef.current);
  }, [rodando]);
  const mm = String(Math.floor(restante / 60)).padStart(2, "0"); const ss = String(restante % 60).padStart(2, "0");
  const total = timerCfg.segundos || 1;
  const pct = Math.max(0, Math.min(1, restante / total));
  const circunf = 2 * Math.PI * 54;
  return (
    <div className="mt-6 flex flex-col items-center">
      <div className="relative w-44 h-44">
        <svg viewBox="0 0 120 120" className="w-44 h-44 -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#EDEFEA" strokeWidth="10" />
          <circle cx="60" cy="60" r="54" fill="none" stroke="#E8462B" strokeWidth="10"
            strokeDasharray={circunf} strokeDashoffset={circunf * (1 - pct)} strokeLinecap="round"
            style={{ transition: rodando ? "stroke-dashoffset 1s linear" : "none" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-4xl font-bold tabular-nums" style={{ color: "#1C2320" }}>{mm}:{ss}</span>
        </div>
      </div>
      <div className="flex gap-2 mt-6">
        <button onClick={() => setRodando((r) => !r)} className="w-14 h-14 rounded-full flex items-center justify-center text-white btn-press" style={{ background: "#E8462B" }}>{rodando ? <Pause size={20} /> : <Play size={20} />}</button>
        <button onClick={() => { setRodando(false); setRestante(timerCfg.segundos); }} className="w-14 h-14 rounded-full flex items-center justify-center btn-press" style={{ border: "2px solid #C7CBC2" }}><RotateCcw size={18} color="#5C6570" /></button>
      </div>
      <div className="flex gap-2 mt-8">
        {[30, 60, 90, 120, 180].map((s) => (
          <button key={s} onClick={() => { setTimerCfg({ segundos: s }); setRestante(s); setRodando(false); }} className="font-mono text-xs px-3 py-2 rounded-full btn-press" style={{ background: timerCfg.segundos === s ? "#1C2320" : "#fff", color: timerCfg.segundos === s ? "#fff" : "#5C6570", border: "1px solid #DCDFD8" }}>{s}s</button>
        ))}
      </div>
    </div>
  );
}

function Evolucao({ pesoEvo }) {
  const exercicios = [...new Set(pesoEvo.map((p) => p.exNome))];
  const [sel, setSel] = useState(exercicios[0] || "");
  useEffect(() => { if (!sel && exercicios.length) setSel(exercicios[0]); }, [exercicios.length]);
  const dados = pesoEvo.filter((p) => p.exNome === sel).sort((a, b) => a.data.localeCompare(b.data)).map((p) => ({ data: p.data.slice(5), peso: p.peso }));
  if (exercicios.length === 0) return <EmptyState text="Ainda não há registros de peso. Registre nos exercícios da aba 'Hoje'." />;
  return (
    <div className="mt-4">
      <div className="flex gap-1 overflow-x-auto pb-2">
        {exercicios.map((e) => (<button key={e} onClick={() => setSel(e)} className="font-mono text-xs px-3 py-1.5 rounded-full shrink-0 btn-press" style={{ background: sel === e ? "#1C2320" : "#fff", color: sel === e ? "#fff" : "#5C6570", border: "1px solid #DCDFD8" }}>{e}</button>))}
      </div>
      <div className="mt-4 card-white p-2" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EDEFEA" />
            <XAxis dataKey="data" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={30} />
            <Tooltip />
            <Line type="monotone" dataKey="peso" stroke="#E8462B" strokeWidth={2} dot={{ r: 3 }} animationDuration={600} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------------- Água ---------------- */
function Agua({ perfil, aguaLog, setAguaLog, horariosAgua, mlPorLembrete, notifPerm, pedirPermissao, router, toggleNotificarAgua }) {
  const consumido = aguaLog[todayKey()] || 0;
  const metaMl = perfil.metaMl || 0;
  const pct = metaMl ? Math.min(100, Math.round((consumido / metaMl) * 100)) : 0;
  const add = (ml) => setAguaLog((l) => ({ ...l, [todayKey()]: Math.max(0, (l[todayKey()] || 0) + ml) }));
  const circunf = 2 * Math.PI * 42;

  return (
    <div className="mt-2">
      <div className="card-white p-5 flex flex-col items-center">
        <div className="relative w-36 h-36">
          <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#EDEFEA" strokeWidth="10" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#1D7A6B" strokeWidth="10"
              strokeDasharray={circunf} strokeDashoffset={circunf * (1 - pct / 100)} strokeLinecap="round"
              className="ring-animate" style={{ "--ring-empty": circunf, "--ring-offset": circunf * (1 - pct / 100) }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold" style={{ color: "#1C2320" }}>{consumido}ml</span>
            <span className="font-mono text-[10px]" style={{ color: "#7A828A" }}>de {metaMl}ml</span>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {[200, 250, 500].map((v) => (<button key={v} onClick={() => add(v)} className="font-mono text-xs px-3 py-2 rounded-full text-white btn-press" style={{ background: "#1D7A6B" }}>+{v}ml</button>))}
          <button onClick={() => add(-consumido)} className="font-mono text-xs px-3 py-2 rounded-full btn-press" style={{ border: "1px solid #DCDFD8", color: "#7A828A" }}>zerar</button>
        </div>
      </div>

      <button onClick={() => router.push("/questionario")} className="flex items-center gap-1.5 text-xs mt-3" style={{ color: "#5C6570" }}>
        <Settings2 size={12} /> Refazer questionário / atualizar dados
      </button>

      <div className="mt-4 card-white p-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#1C2320" }}><Bell size={14} /> Notificar lembretes de água</span>
          <Switch checked={perfil.notificarAgua !== false} onChange={toggleNotificarAgua} />
        </label>
      </div>

      <div className="mt-4">
        <p className="font-mono text-xs mb-2" style={{ color: "#5C6570" }}>LEMBRETES · A CADA {perfil.intervaloH}H, DAS {perfil.inicio} ÀS {perfil.fim}</p>
        {horariosAgua.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {horariosAgua.map((h) => (<span key={h} className="font-mono text-[11px] px-2.5 py-1 rounded-full" style={{ background: "#fff", color: "#1C2320" }}>{h} · {mlPorLembrete}ml</span>))}
          </div>
        )}
        <NotifButton notifPerm={notifPerm} pedirPermissao={pedirPermissao} />
      </div>
    </div>
  );
}

/* ---------------- Dieta ---------------- */
function Dieta({ refeicoes, setRefeicoes, dietaArquivo, setDietaArquivo, notificarDieta, setNotificarDieta, notifPerm, pedirPermissao, showToast }) {
  const [sub, setSub] = useState("hoje");
  const [diaEdit, setDiaEdit] = useState(todayDia());
  const [lendoPdf, setLendoPdf] = useState(false);
  const fileRef = useRef(null);

  const aplicarImportadas = (importadas) => {
    const dias = Object.keys(importadas);
    if (!dias.length) {
      showToast("Não conseguimos reconhecer refeições nesse arquivo automaticamente. Ele foi salvo para consulta.");
      return;
    }
    setRefeicoes((r) => ({ ...r, ...importadas }));
    const total = Object.values(importadas).reduce((n, lista) => n + lista.length, 0);
    showToast(dias.length >= DIAS.length
      ? `Dieta enviada — ${total} refeição(ões) aplicada(s) automaticamente a todos os dias da semana.`
      : `Dieta enviada — refeições distribuídas automaticamente em ${dias.length} dia(s) da semana.`);
  };

  const onFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const isText = !isPdf && (/^(text|application\/json|application\/csv)/.test(file.type) || /\.(txt|csv|md)$/i.test(file.name));
    const reader = new FileReader();
    reader.onload = async () => {
      const conteudo = String(reader.result);
      setDietaArquivo({ nome: file.name, tipo: isText ? "texto" : "arquivo", conteudo });
      if (isText) {
        aplicarImportadas(parseDietaArquivo(conteudo).dias);
      } else if (isPdf) {
        setLendoPdf(true);
        try {
          const { analisarPlanoAlimentar } = await import("@/lib/ai");
          const { dias } = await analisarPlanoAlimentar(conteudo);
          aplicarImportadas(dias);
        } catch (err) {
          console.error("Erro ao ler PDF da dieta", err);
          const motivo = (err && err.message ? err.message : String(err)).slice(0, 320);
          showToast(`Não conseguimos ler esse PDF automaticamente (${motivo}). O arquivo foi salvo para consulta.`);
        } finally {
          setLendoPdf(false);
        }
      } else {
        showToast("Dieta enviada com sucesso. Envie um arquivo .txt/.csv/.md/.pdf para lançar as refeições automaticamente.");
      }
    };
    if (isText) reader.readAsText(file); else reader.readAsDataURL(file);
    e.target.value = "";
  };
  const removeDietaArquivo = () => { setDietaArquivo(null); showToast("Arquivo da dieta removido."); };
  const addRefeicao = (dia) => setRefeicoes((r) => ({ ...r, [dia]: [...(r[dia] || []), { id: uid(), horario: "12:00", opcoes: "", notificar: true }] }));
  const updRefeicao = (dia, id, patch) => setRefeicoes((r) => ({ ...r, [dia]: (r[dia] || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const delRefeicao = (dia, id) => setRefeicoes((r) => ({ ...r, [dia]: (r[dia] || []).filter((x) => x.id !== id) }));
  const refeicoesHoje = [...(refeicoes[todayDia()] || [])].sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));
  const SUBTABS = [{ id: "hoje", label: "Hoje" }, { id: "refeicoes", label: "Refeições" }, { id: "arquivo", label: "Arquivo" }, { id: "receitas", label: "Receitas" }];

  return (
    <div>
      <div className="mb-3 card-white p-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#1C2320" }}><Bell size={14} /> Notificar lembretes de dieta</span>
          <Switch checked={notificarDieta} onChange={() => setNotificarDieta((v) => !v)} />
        </label>
      </div>
      <SubNav items={SUBTABS} value={sub} onChange={setSub} accent="#C9A227" />
      {sub === "hoje" && (
        <div className="mt-4 space-y-2">
          <p className="font-mono text-xs mb-2" style={{ color: "#5C6570" }}>{DIA_LABEL[todayDia()].toUpperCase()} · REFEIÇÕES DE HOJE</p>
          {refeicoesHoje.length === 0 ? <EmptyState text="Nenhuma refeição cadastrada para hoje. Vá em 'Refeições' e adicione, ou importe um arquivo da dieta." /> : refeicoesHoje.map((r) => (
            <div key={r.id} className="card-white p-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs" style={{ color: "#7A828A" }}>{r.horario}</p>
                <p className="font-semibold text-sm" style={{ color: "#1C2320" }}>{r.opcoes}</p>
              </div>
              {r.notificar !== false && <span className="flex items-center gap-1 font-mono text-[10px] shrink-0" style={{ color: "#C9A227" }}><Bell size={10} /> notifica</span>}
            </div>
          ))}
        </div>
      )}
      {sub === "refeicoes" && (
        <div className="mt-4">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {DIAS.map((d) => (
              <button key={d} onClick={() => setDiaEdit(d)} className="font-mono text-xs px-3 py-1.5 rounded-full shrink-0 btn-press" style={{ background: diaEdit === d ? "#1C2320" : "#fff", color: diaEdit === d ? "#fff" : "#5C6570", border: "1px solid #DCDFD8" }}>
                {DIA_LABEL[d].slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {(refeicoes[diaEdit] || []).map((r) => (
              <div key={r.id} className="card-white p-3">
                <div className="flex items-center gap-2">
                  <input type="time" value={r.horario} onChange={(e) => updRefeicao(diaEdit, r.id, { horario: e.target.value })} className="font-mono text-sm px-2 py-1.5 rounded-full" style={{ border: "1px solid #C7CBC2" }} />
                  <input placeholder="Opções da refeição" value={r.opcoes} onChange={(e) => updRefeicao(diaEdit, r.id, { opcoes: e.target.value })} className="flex-1 text-sm px-3 py-1.5 rounded-full" style={{ border: "1px solid #C7CBC2" }} />
                  <button onClick={() => delRefeicao(diaEdit, r.id)}><Trash2 size={16} color="#B0473A" /></button>
                </div>
                <label className="flex items-center gap-1.5 mt-2 pl-1 text-xs cursor-pointer" style={{ color: "#5C6570" }}>
                  <input type="checkbox" checked={r.notificar !== false} onChange={(e) => updRefeicao(diaEdit, r.id, { notificar: e.target.checked })} className="toggle-check" />
                  <Bell size={11} /> Notificar esta refeição
                </label>
              </div>
            ))}
            <button onClick={() => addRefeicao(diaEdit)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-display text-sm uppercase tracking-wide btn-press" style={{ border: "2px dashed #C7CBC2", color: "#5C6570" }}><Plus size={16} /> Adicionar refeição em {DIA_LABEL[diaEdit]}</button>
          </div>
          <NotifButton notifPerm={notifPerm} pedirPermissao={pedirPermissao} />
        </div>
      )}
      {sub === "arquivo" && (
        <div className="mt-4">
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} accept=".txt,.csv,.md,.pdf,image/*" />
          <button onClick={() => fileRef.current.click()} disabled={lendoPdf} className="w-full flex items-center justify-center gap-2 py-4 rounded-full font-display text-sm uppercase tracking-wide text-white btn-press" style={{ background: "#C9A227", opacity: lendoPdf ? 0.6 : 1 }}>
            <Upload size={16} /> {lendoPdf ? "Lendo com IA…" : "Enviar arquivo da dieta"}
          </button>
          <p className="text-[11px] mt-1.5" style={{ color: "#7A828A" }}>
            Envie um arquivo .txt/.csv/.md com uma refeição por linha, ou um PDF de plano alimentar em qualquer formato (tabela, lista, texto livre — de qualquer app ou nutricionista). PDFs são lidos por IA, que identifica as refeições e horários automaticamente. Se o plano indicar dias da semana, as refeições são organizadas por dia; caso contrário, a mesma lista é aplicada a todos os dias. Arquivos de imagem ficam salvos para consulta, mas não são lidos automaticamente.
          </p>
          {dietaArquivo && (
            <div className="mt-4 card-white p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {dietaArquivo.tipo === "texto" ? <FileText size={16} color="#5C6570" className="shrink-0" /> : <ImageIcon size={16} color="#5C6570" className="shrink-0" />}
                  <span className="font-mono text-xs truncate" style={{ color: "#1C2320" }}>{dietaArquivo.nome}</span>
                </div>
                <button onClick={removeDietaArquivo} className="shrink-0" title="Excluir arquivo anexado"><Trash2 size={16} color="#B0473A" /></button>
              </div>
              {dietaArquivo.tipo === "texto" ? (
                <pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto" style={{ color: "#1C2320" }}>{dietaArquivo.conteudo}</pre>
              ) : dietaArquivo.conteudo.startsWith("data:image") ? (
                <img src={dietaArquivo.conteudo} alt="dieta" className="max-h-64 rounded-2xl" />
              ) : (
                <a href={dietaArquivo.conteudo} download={dietaArquivo.nome} className="text-xs underline" style={{ color: "#C9A227" }}>Baixar arquivo</a>
              )}
            </div>
          )}
        </div>
      )}
      {sub === "receitas" && (
        <div className="mt-4 space-y-2">
          {RECEITAS.map((r) => (
            <div key={r.nome} className="card-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold text-sm" style={{ color: "#1C2320" }}>{r.nome}</p><p className="text-xs mt-1" style={{ color: "#5C6570" }}>{r.desc}</p></div>
                <a href={`https://www.tiktok.com/search?q=${encodeURIComponent(r.nome)}`} onClick={(e) => { e.preventDefault(); abrirTiktokBusca(r.nome); }} rel="noopener noreferrer" className="shrink-0 flex items-center gap-1 font-mono text-[11px] px-3 py-1.5 rounded-full btn-press" style={{ background: "#1C2320", color: "#fff" }}>TikTok <ChevronRight size={12} /></a>
              </div>
            </div>
          ))}
          <p className="text-xs mt-2" style={{ color: "#7A828A" }}>* A integração direta com a API do TikTok exige autenticação própria da plataforma; os botões tentam abrir a busca correspondente no app do TikTok (se instalado) ou no site, como alternativa.</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Casa ---------------- */
// Três tipos de tarefa: "diaria" (todo dia), "semanal" (dias fixos da
// semana, repete toda semana) e "pontual" (tarefa avulsa/spot, ligada a
// uma única data, sem repetição). Tipos antigos ("personalizado"/"prazo")
// são migrados em migrarTarefas() ao carregar os dados.
function tarefaEhHoje(t) {
  if (t.tipo === "diaria") return true;
  if (t.tipo === "semanal") return (t.diasSemana || []).includes(todayDia());
  if (t.tipo === "pontual") return t.data === todayKey() || (!t.concluida && !!t.data && t.data < todayKey());
  return true;
}
function tarefaConcluidaHoje(t) {
  if (t.tipo === "pontual") return !!t.concluida;
  return t.concluidoEm === todayKey();
}
function tarefaAtrasada(t) {
  return t.tipo === "pontual" && !t.concluida && !!t.data && t.data < todayKey();
}

function Casa({ tarefas, setTarefas, notificarCasa, setNotificarCasa, notifPerm, pedirPermissao, showToast }) {
  const [mostrarForm, setMostrarForm] = useState(false);

  const toggleConcluir = (t) => {
    setTarefas((ts) => ts.map((x) => {
      if (x.id !== t.id) return x;
      if (x.tipo === "pontual") return { ...x, concluida: !x.concluida };
      const jaConcluida = x.concluidoEm === todayKey();
      return { ...x, concluidoEm: jaConcluida ? null : todayKey() };
    }));
  };
  const remover = (id) => setTarefas((ts) => ts.filter((t) => t.id !== id));
  const adicionar = (nova) => { setTarefas((ts) => [...ts, { ...nova, id: uid() }]); setMostrarForm(false); showToast("Tarefa adicionada 🏠"); };

  const hojeList = tarefas.filter(tarefaEhHoje).sort((a, b) => {
    const pa = tarefaConcluidaHoje(a) ? 1 : 0, pb = tarefaConcluidaHoje(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return (a.horario || "99:99").localeCompare(b.horario || "99:99");
  });

  return (
    <div className="mt-2">
      <div className="mb-3 card-white p-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#1C2320" }}><Bell size={14} /> Notificar lembretes de tarefas</span>
          <Switch checked={notificarCasa} onChange={() => setNotificarCasa((v) => !v)} />
        </label>
      </div>
      <p className="font-mono text-xs mb-2" style={{ color: "#5C6570" }}>{DIA_LABEL[todayDia()].toUpperCase()} · TAREFAS DE HOJE</p>

      {hojeList.length === 0 && <EmptyState text="Nenhuma tarefa por aqui ainda. Adicione tarefas diárias, semanais ou pontuais (sem repetição)." />}

      <div className="space-y-2">
        {hojeList.map((t) => {
          const feita = tarefaConcluidaHoje(t);
          return (
            <div key={t.id} className="card-white p-3">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleConcluir(t)} className={"mt-0.5 flex items-center justify-center w-6 h-6 rounded-full shrink-0" + (feita ? " check-pop" : "")} style={{ background: feita ? "#6E7BC9" : "transparent", border: "2px solid #6E7BC9" }}>
                  {feita && <Check size={14} color="#fff" strokeWidth={3} />}
                </button>
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: "#1C2320", textDecoration: feita ? "line-through" : "none" }}>{t.titulo}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <TagTipo tipo={t.tipo} data={t.data} diasSemana={t.diasSemana} />
                    {tarefaAtrasada(t) && <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#F6DCD8", color: "#B0473A" }}>atrasada</span>}
                    {t.horario && <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#EDEFEA", color: "#5C6570" }}>{t.horario}</span>}
                    {t.notificar && <span className="flex items-center gap-0.5 font-mono text-[10px]" style={{ color: "#6E7BC9" }}><Bell size={10} /> notifica</span>}
                  </div>
                </div>
                <button onClick={() => remover(t.id)}><Trash2 size={15} color="#B0473A" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {!mostrarForm ? (
        <button onClick={() => setMostrarForm(true)} className="w-full flex items-center justify-center gap-2 py-3 mt-3 rounded-2xl font-display text-sm uppercase tracking-wide btn-press" style={{ border: "2px dashed #C7CBC2", color: "#5C6570" }}>
          <Plus size={16} /> Nova tarefa
        </button>
      ) : (
        <FormTarefa onCancelar={() => setMostrarForm(false)} onSalvar={adicionar} />
      )}

      <div className="mt-3"><NotifButton notifPerm={notifPerm} pedirPermissao={pedirPermissao} /></div>
    </div>
  );
}

function TagTipo({ tipo, data, diasSemana }) {
  if (tipo === "diaria") return <span className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#EDEFEA", color: "#5C6570" }}><Repeat size={10} /> diária</span>;
  if (tipo === "semanal") return <span className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#EDEFEA", color: "#5C6570" }}><CalendarDays size={10} /> {(diasSemana || []).map((d) => d.slice(0, 3)).join(", ")}</span>;
  return <span className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#EDEFEA", color: "#5C6570" }}><CalendarClock size={10} /> {data}</span>;
}

function FormTarefa({ onSalvar, onCancelar }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("diaria");
  const [diasSemana, setDiasSemana] = useState([todayDia()]);
  const [data, setData] = useState(todayKey());
  const [horario, setHorario] = useState("");
  const [notificar, setNotificar] = useState(true);

  const toggleDia = (d) => setDiasSemana((ds) => ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]);

  const salvar = () => {
    if (!titulo.trim()) return;
    const nova = { titulo: titulo.trim(), tipo };
    if (tipo === "semanal") nova.diasSemana = diasSemana;
    if (tipo === "pontual") nova.data = data;
    if (horario) { nova.horario = horario; nova.notificar = notificar; }
    onSalvar(nova);
  };

  return (
    <div className="card-white p-4 mt-3 pop-in">
      <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>TÍTULO</p>
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex: Lavar a louça" className="input mb-3" autoFocus />

      <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>REPETIÇÃO</p>
      <div className="flex gap-2 mb-3">
        {[{ id: "diaria", label: "Diária" }, { id: "semanal", label: "Semanal" }, { id: "pontual", label: "Pontual" }].map((o) => (
          <button key={o.id} onClick={() => setTipo(o.id)} className="flex-1 font-mono text-xs py-2 rounded-full btn-press" style={{ background: tipo === o.id ? "#6E7BC9" : "#fff", color: tipo === o.id ? "#fff" : "#5C6570", border: "1px solid #C7CBC2" }}>{o.label}</button>
        ))}
      </div>

      {tipo === "semanal" && (
        <div className="mb-3">
          <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>REPETIR NOS DIAS (ex: terça, quinta e sábado)</p>
          <div className="flex gap-1 flex-wrap">
            {DIAS.map((d) => (
              <button key={d} onClick={() => toggleDia(d)} className="font-mono text-[10px] px-2.5 py-1.5 rounded-full btn-press" style={{ background: diasSemana.includes(d) ? "#6E7BC9" : "#fff", color: diasSemana.includes(d) ? "#fff" : "#5C6570", border: "1px solid #C7CBC2" }}>{d.slice(0, 3).toUpperCase()}</button>
            ))}
          </div>
        </div>
      )}
      {tipo === "pontual" && (
        <div className="mb-3">
          <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>DATA (TAREFA AVULSA, SEM REPETIÇÃO)</p>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="input" />
        </div>
      )}

      <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>HORÁRIO DO LEMBRETE (OPCIONAL)</p>
      <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className="input mb-2" />
      <label className="flex items-center gap-2 text-xs mb-4" style={{ color: "#5C6570" }}>
        <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} disabled={!horario} className="toggle-check" />
        <Bell size={12} /> Notificar no horário {!horario && "(defina um horário acima)"}
      </label>

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 py-2.5 rounded-full font-display text-xs uppercase tracking-wide btn-press" style={{ border: "1px solid #C7CBC2", color: "#5C6570" }}>Cancelar</button>
        <button onClick={salvar} className="flex-1 py-2.5 rounded-full font-display text-xs uppercase tracking-wide text-white btn-press" style={{ background: "#6E7BC9" }}>Salvar tarefa</button>
      </div>
    </div>
  );
}

/* ---------------- comuns ---------------- */
function SubNav({ items, value, onChange, accent }) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {items.map((it) => (<button key={it.id} onClick={() => onChange(it.id)} className="font-mono text-xs px-3 py-1.5 rounded-full shrink-0 whitespace-nowrap btn-press" style={{ background: value === it.id ? accent : "#fff", color: value === it.id ? "#fff" : "#5C6570", border: "1px solid " + (value === it.id ? accent : "#DCDFD8") }}>{it.label}</button>))}
    </div>
  );
}
function EmptyState({ text }) { return <div className="rounded-2xl p-4 text-sm fade-in" style={{ background: "#fff", border: "1px dashed #C7CBC2", color: "#5C6570" }}>{text}</div>; }
function NotifButton({ notifPerm, pedirPermissao }) {
  if (notifPerm === "granted") return <p className="flex items-center gap-1.5 text-xs mt-3" style={{ color: "#1D7A6B" }}><Bell size={12} /> Notificações ativadas</p>;
  return <button onClick={pedirPermissao} className="flex items-center gap-1.5 text-xs mt-3 btn-press" style={{ color: "#5C6570" }}><BellOff size={12} /> Ativar notificações push</button>;
}
function Switch({ checked, onChange }) {
  return (
    <button onClick={onChange} className="relative w-11 h-6 rounded-full transition-colors btn-press" style={{ background: checked ? "#1D7A6B" : "#DCDFD8" }}>
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }} />
    </button>
  );
}
