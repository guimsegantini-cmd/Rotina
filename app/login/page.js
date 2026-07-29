"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  GoogleAuthProvider, signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthProvider";
import { loadPerfilAgua } from "@/lib/db";

const EMAIL_STORAGE_KEY = "emailForSignIn";

export default function LoginPage() {
  const router = useRouter();
  const { user, loadingAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [completando, setCompletando] = useState(false);

  useEffect(() => {
    if (!loadingAuth && user) {
      (async () => {
        const perfil = await loadPerfilAgua(user.uid);
        router.replace(perfil ? "/dashboard" : "/questionario");
      })();
    }
  }, [user, loadingAuth, router]);

  // Conclui login via link de e-mail (quando o usuário volta pelo link recebido)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSignInWithEmailLink(auth, window.location.href)) {
      setCompletando(true);
      let savedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);
      if (!savedEmail) savedEmail = window.prompt("Confirme seu e-mail para concluir o login:");
      signInWithEmailLink(auth, savedEmail, window.location.href)
        .then(() => { window.localStorage.removeItem(EMAIL_STORAGE_KEY); router.replace("/"); })
        .catch((err) => { console.error(err); setErro("Não foi possível concluir o login. Peça um novo link."); setCompletando(false); });
    }
  }, [router]);

  const enviarLink = async (e) => {
    e.preventDefault();
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valido) { setErro("Digite um e-mail válido."); return; }
    setErro("");
    try {
      await sendSignInLinkToEmail(auth, email, { url: window.location.origin + "/login", handleCodeInApp: true });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
      setEnviado(true);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível enviar o link. Confira se o e-mail está correto e tente de novo.");
    }
  };

  const entrarComGoogle = async () => {
    setErro("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (result?.user) router.replace("/");
    } catch (err) {
      console.error(err);
      setErro("Não foi possível entrar com Google. Tente de novo.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 relative overflow-hidden" style={{ background: "#14181C" }}>
      <div className="blob floaty" style={{ position: "absolute", top: "-60px", left: "-60px", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle at 30% 30%, #1D7A6B, transparent 70%)", opacity: 0.35, filter: "blur(10px)" }} />
      <div className="blob" style={{ position: "absolute", bottom: "-80px", right: "-60px", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle at 60% 40%, #E8462B, transparent 70%)", opacity: 0.3, filter: "blur(14px)", animationDelay: "-4s" }} />

      <div className="w-full max-w-sm fade-in relative">
        <p className="font-display uppercase text-[11px] tracking-[0.25em] text-center" style={{ color: "#7A828A" }}>Ficha de rotina</p>
        <h1 className="font-display text-4xl text-white text-center mt-1 mb-8">
          Rotina<span style={{ color: "#E8462B" }}>.</span>
        </h1>

        <div className="card-soft p-6 pop-in">
          {completando ? (
            <p className="text-sm text-center pulse-soft" style={{ color: "#5C6570" }}>Concluindo login…</p>
          ) : enviado ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-2 check-pop" size={30} color="#1D7A6B" />
              <p className="font-semibold text-sm" style={{ color: "#1C2320" }}>Link enviado para {email}</p>
              <p className="text-xs mt-2" style={{ color: "#5C6570" }}>Abra seu e-mail neste mesmo dispositivo e toque no link para entrar.</p>
              <button onClick={() => setEnviado(false)} className="text-xs mt-4 underline" style={{ color: "#7A828A" }}>usar outro e-mail</button>
            </div>
          ) : (
            <>
              <form onSubmit={enviarLink}>
                <p className="font-mono text-[11px] mb-1" style={{ color: "#7A828A" }}>E-MAIL</p>
                <div className="flex items-center gap-2 px-4 py-3 rounded-full mb-1" style={{ background: "#fff", border: "1px solid #C7CBC2" }}>
                  <Mail size={16} color="#7A828A" />
                  <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(""); }}
                    placeholder="voce@email.com" className="flex-1 outline-none text-sm bg-transparent" style={{ color: "#1C2320" }} autoFocus />
                </div>
                {erro && <p className="text-xs mt-1 px-1" style={{ color: "#B0473A" }}>{erro}</p>}

                <button type="submit" className="w-full mt-5 py-3 rounded-full font-display uppercase tracking-wide text-white flex items-center justify-center gap-2 btn-press" style={{ background: "#E8462B" }}>
                  Enviar link de acesso <ArrowRight size={16} />
                </button>
              </form>

              <div className="flex items-center gap-3 my-4">
                <div style={{ flex: 1, height: 1, background: "#C7CBC2" }} />
                <span className="text-xs" style={{ color: "#7A828A" }}>ou</span>
                <div style={{ flex: 1, height: 1, background: "#C7CBC2" }} />
              </div>

              <button
                type="button"
                onClick={entrarComGoogle}
                className="w-full py-3 rounded-full font-display uppercase tracking-wide flex items-center justify-center gap-2 btn-press"
                style={{ background: "#fff", border: "1px solid #C7CBC2", color: "#1C2320" }}
              >
                Entrar com Google
              </button>

              <p className="text-xs mt-4 text-center" style={{ color: "#7A828A" }}>Sem senha: você recebe um link por e-mail para entrar com segurança.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
