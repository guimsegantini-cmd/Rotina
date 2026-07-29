// Gera public/firebase-messaging-sw.js preenchido com as variáveis do
// .env.local, para não precisar editar esse arquivo manualmente sempre que
// as chaves do Firebase mudarem. Roda automaticamente antes de "dev" e "build".
const fs = require("fs");
const path = require("path");

function parseEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const out = {};
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
  return out;
}

const env = { ...parseEnvLocal(), ...process.env };

const cfg = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

const template = `/* eslint-disable no-undef */
// Gerado automaticamente por scripts/generate-sw.js a partir do .env.local
// Não edite este arquivo direto — edite o .env.local (ou as variáveis de
// ambiente na Vercel) e rode "npm run dev" / "npm run build" de novo.

importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(cfg, null, 2)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Rotina", {
    body: body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((all) => {
      if (all.length > 0) return all[0].focus();
      return clients.openWindow("/");
    })
  );
});
`;

fs.writeFileSync(path.join(__dirname, "..", "public", "firebase-messaging-sw.js"), template);
console.log("✓ public/firebase-messaging-sw.js gerado a partir do .env.local");
