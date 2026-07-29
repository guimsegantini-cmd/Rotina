"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { loadPerfilAgua } from "@/lib/db";

export default function Home() {
  const router = useRouter();
  const { user, loadingAuth } = useAuth();

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) { router.replace("/login"); return; }
    (async () => {
      const perfil = await loadPerfilAgua(user.uid);
      router.replace(perfil ? "/dashboard" : "/questionario");
    })();
  }, [user, loadingAuth, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#14181C" }}>
      <p className="font-mono text-sm" style={{ color: "#7A828A" }}>carregando…</p>
    </div>
  );
}
