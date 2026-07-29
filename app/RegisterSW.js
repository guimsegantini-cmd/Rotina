"use client";
import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((e) => {
        console.error("Falha ao registrar service worker", e);
      });
    }
  }, []);
  return null;
}
