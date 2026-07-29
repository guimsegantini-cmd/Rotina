"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Droplets, ArrowRight, Bell } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { savePerfilAgua, saveFcmToken } from "@/lib/db";
import { calcularMetaAgua, gerarHorarios } from "@/lib/water";
import { ativarPushNotifications } from "@/lib/messaging";

export default function Questionario() {
  const router = useRouter();
  const { user, loadingAuth } = useAuth();
  const [form, setForm] = useState({
    peso: "", altura: "", idade: "", sexo: "feminino", atividade: "leve",
    inicio: "07:00", fim: "22:00", intervaloH: 2, notificarAgua: true,
  });
  const [resultado, setResultado] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!loadingAuth && !user) router.replace("/login");
  }, [user, loadingAuth, router]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const calcular = (e) => {
    e.preventDefault();
    if (!form.peso || !form.altura) return;
    const meta = calcularMetaAgua(form);
    setResultado(meta);
  };

  const confirmar = async () => {
    if (!user) return;
    setSalvando(true);
    const horarios = gerarHorarios(form.inicio, form.fim, form.intervaloH);
    const mlPorLembrete = horarios.length ? Math.round(resultado / horarios.length) : 0;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await savePerfilAgua(user.uid, {
      ...form, metaMl: resultado, horarios, mlPorLembrete, timezone,
      atualizadoEm: new Date().toISOString(),
    });

    if (form.notificarAgua) {
      const r = await ativarPushNotifications();
      if (r?.ok && r.token) await saveFcmToken(user.uid, r.token);
    }
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen px-5 py-8 fade-in" style={{ background: "#14181C" }}>
      <div className="max-w-md mx-auto">
        <p className="font-display uppercase text-[11px] tracking-[0.25em]" style={{ color: "#7A828A" }}>Passo 1 de 1</p>
        <h1 className="font-display text-3xl text-white mt-1 mb-1">Seu perfil de hidratação</h1>
        <p className="text-sm mb-6" style={{ color: "#9AA1A8" }}>Usamos esses dados só para calcular sua meta diária de água e sugerir os horários de lembrete.</p>

        <form onSubmit={calcular} className="card-soft p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Peso (kg)">
              <input required type="number" value={form.peso} onChange={set("peso")} className="input" />
            </Campo>
            <Campo label="Altura (cm)">
              <input required type="number" value={form.altura} onChange={set("altura")} className="input" />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Idade">
              <input type="number" value={form.idade} onChange={set("idade")} className="input" />
            </Campo>
            <Campo label="Sexo">
              <select value={form.sexo} onChange={set("sexo")} className="input">
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </select>
            </Campo>
          </div>

          <Campo label="Nível de atividade física">
            <select value={form.atividade} onChange={set("atividade")} className="input">
              <option value="sedentario">Sedentário</option>
              <option value="leve">Leve (1–2x/semana)</option>
              <option value="moderado">Moderado (3–4x/semana)</option>
              <option value="intenso">Intenso (5x+/semana)</option>
            </select>
          </Campo>

          <div className="grid grid-cols-3 gap-3">
            <Campo label="Acorda"><input type="time" value={form.inicio} onChange={set("inicio")} className="input" /></Campo>
            <Campo label="Dorme"><input type="time" value={form.fim} onChange={set("fim")} className="input" /></Campo>
            <Campo label="A cada">
              <select value={form.intervaloH} onChange={set("intervaloH")} className="input">
                {[1, 1.5, 2, 3].map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </Campo>
          </div>

          <label className="flex items-center gap-2 text-xs pt-1" style={{ color: "#5C6570" }}>
            <input type="checkbox" checked={form.notificarAgua} onChange={set("notificarAgua")} className="toggle-check" />
            <Bell size={13} /> Notificar meus lembretes de água
          </label>

          <button type="submit" className="w-full py-3 rounded-full font-display uppercase tracking-wide text-white flex items-center justify-center gap-2 btn-press" style={{ background: "#1D7A6B" }}>
            Calcular minha meta <Droplets size={16} />
          </button>
        </form>

        {resultado > 0 && (
          <div className="card-soft p-5 mt-4 text-center pop-in" style={{ background: "#fff" }}>
            <p className="font-mono text-xs" style={{ color: "#7A828A" }}>SUA META DIÁRIA ESTIMADA</p>
            <p className="font-display text-4xl mt-1" style={{ color: "#1D7A6B" }}>{resultado} ml</p>
            <p className="text-xs mt-2" style={{ color: "#5C6570" }}>Estimativa geral (~35ml/kg, ajustada por altura, idade e atividade). Não substitui orientação médica ou nutricional.</p>
            <button onClick={confirmar} disabled={salvando} className="w-full mt-4 py-3 rounded-full font-display uppercase tracking-wide text-white flex items-center justify-center gap-2 btn-press" style={{ background: "#E8462B" }}>
              {salvando ? "Salvando…" : <>Ir para o painel <ArrowRight size={16} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>{label.toUpperCase()}</p>
      {children}
    </div>
  );
}
