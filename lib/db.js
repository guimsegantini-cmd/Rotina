"use client";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Todos os dados de um usuário ficam em um único documento: users/{uid}
// Cada "chave" (ficha, checkins, aguaLog, etc.) é um campo desse documento.

// O Firestore rejeita a escrita inteira se qualquer campo aninhado for
// `undefined` (comum em objetos montados condicionalmente, ex: tarefas sem
// horário). Removemos essas chaves recursivamente antes de salvar para que
// um campo opcional ausente nunca derrube o save inteiro.
function sanitizeDeep(value) {
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = sanitizeDeep(v);
    }
    return out;
  }
  return value;
}

export async function loadField(uid, field, fallback) {
  if (!uid) return fallback;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && snap.data()[field] !== undefined) return snap.data()[field];
    return fallback;
  } catch (e) {
    console.error("Firestore load error", e);
    return fallback;
  }
}

export async function saveField(uid, field, value) {
  if (!uid) return;
  try {
    await setDoc(doc(db, "users", uid), { [field]: sanitizeDeep(value) }, { merge: true });
  } catch (e) {
    console.error("Firestore save error", e);
  }
}

export async function loadPerfilAgua(uid) {
  return loadField(uid, "perfilAgua", null);
}

export async function savePerfilAgua(uid, perfil) {
  return saveField(uid, "perfilAgua", perfil);
}

export async function saveFcmToken(uid, token) {
  return saveField(uid, "fcmToken", token);
}
