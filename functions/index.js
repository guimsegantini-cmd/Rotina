const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

const TZ_PADRAO = "America/Sao_Paulo";
const TOLERANCIA_MIN = 7; // metade do intervalo de 15 min entre execuções

function horaLocalAgora(timezone) {
  try {
    return new Date().toLocaleTimeString("pt-BR", {
      timeZone: timezone || TZ_PADRAO, hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return new Date().toLocaleTimeString("pt-BR", {
      timeZone: TZ_PADRAO, hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }
}
function hojeStr(timezone) {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone || TZ_PADRAO });
}
function diffMinutos(hhmmA, hhmmB) {
  const [ha, ma] = hhmmA.split(":").map(Number);
  const [hb, mb] = hhmmB.split(":").map(Number);
  return Math.abs(ha * 60 + ma - (hb * 60 + mb));
}

// Roda a cada 15 minutos. Cada usuário fica salvo em users/{uid} com os
// campos: fcmToken, perfilAgua (com notificarAgua, horarios[], timezone),
// "dieta-refeicoes" (cada item com notificar + horario) e "casa-tarefas"
// (cada item com notificar + horario + concluidoEm).
exports.enviarLembretes = onSchedule("every 15 minutes", async () => {
  const snap = await db.collection("users").get();

  await Promise.all(snap.docs.map(async (doc) => {
    const data = doc.data();
    const token = data.fcmToken;
    if (!token) return;

    const tz = data.perfilAgua?.timezone || TZ_PADRAO;
    const horaAtual = horaLocalAgora(tz);
    const hoje = hojeStr(tz);
    const jaEnviadosHoje = data.enviadosHoje && data.enviadosHoje.data === hoje ? data.enviadosHoje.horarios || [] : [];
    const enviados = [...jaEnviadosHoje];
    const mensagens = [];

    // Água
    const perfil = data.perfilAgua;
    if (perfil?.notificarAgua && Array.isArray(perfil.horarios)) {
      for (const h of perfil.horarios) {
        const chave = `agua-${h}`;
        if (diffMinutos(h, horaAtual) <= TOLERANCIA_MIN && !enviados.includes(chave)) {
          mensagens.push({ title: "Hora de beber água 💧", body: `Beba aproximadamente ${perfil.mlPorLembrete || ""}ml agora.` });
          enviados.push(chave);
        }
      }
    }

    // Dieta
    const refeicoes = data["dieta-refeicoes"] || [];
    for (const r of refeicoes) {
      if (!r.notificar || !r.horario) continue;
      const chave = `ref-${r.id}`;
      if (diffMinutos(r.horario, horaAtual) <= TOLERANCIA_MIN && !enviados.includes(chave)) {
        mensagens.push({ title: "Hora da refeição 🍽️", body: r.opcoes || "Confira suas opções da dieta." });
        enviados.push(chave);
      }
    }

    // Casa
    const tarefas = data["casa-tarefas"] || [];
    for (const t of tarefas) {
      if (!t.notificar || !t.horario) continue;
      if (t.concluidoEm === hoje) continue;
      const chave = `casa-${t.id}`;
      if (diffMinutos(t.horario, horaAtual) <= TOLERANCIA_MIN && !enviados.includes(chave)) {
        mensagens.push({ title: "Tarefa pendente 🏠", body: t.titulo });
        enviados.push(chave);
      }
    }

    for (const m of mensagens) {
      try {
        await messaging.send({ token, notification: { title: m.title, body: m.body } });
      } catch (e) {
        console.error(`Erro ao enviar push para ${doc.id}:`, e.message);
      }
    }

    if (mensagens.length > 0) {
      await doc.ref.set({ enviadosHoje: { data: hoje, horarios: enviados } }, { merge: true });
    }
  }));
});
