"use client";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, GoogleAIBackend } from "firebase/ai";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Só inicializa no navegador: durante o build/prerender no servidor não há
// chaves válidas de ambiente disponíveis para o Firebase, e o SDK de Auth
// depende de APIs do navegador de qualquer forma.
let app = null;
let ai = null;
if (typeof window !== "undefined") {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

  // App Check protege a API do Gemini (Firebase AI Logic) contra uso por
  // clientes não autorizados. Exige uma chave do reCAPTCHA Enterprise
  // cadastrada em Firebase Console > App Check (ver .env.local.example).
  // Sem a chave configurada, a leitura de arquivos por IA simplesmente não
  // fica disponível (o resto do app funciona normalmente).
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (recaptchaSiteKey) {
    if (process.env.NODE_ENV !== "production") {
      // Token de debug do App Check para desenvolvimento local — sem isso,
      // chamadas à IA feitas fora do domínio de produção são rejeitadas.
      // Ver: https://firebase.google.com/docs/app-check/web/debug-provider
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (e) {
      console.error("Falha ao iniciar o Firebase App Check", e);
    }
    ai = getAI(app, { backend: new GoogleAIBackend() });
  }
}

export { app, ai };
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
