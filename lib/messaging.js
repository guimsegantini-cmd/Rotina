"use client";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { app } from "./firebase";

// Pede permissão de notificação, registra o service worker do FCM e devolve
// o token do dispositivo (para salvar no Firestore e o back-end enviar push).
export async function ativarPushNotifications() {
  if (typeof window === "undefined") return null;
  const suportado = await isSupported().catch(() => false);
  if (!suportado) return { ok: false, motivo: "não suportado neste navegador" };

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") return { ok: false, motivo: "permissão negada" };

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return { ok: true, token };
  } catch (e) {
    console.error("Erro ao ativar notificações push", e);
    return { ok: false, motivo: "erro técnico ao ativar" };
  }
}
