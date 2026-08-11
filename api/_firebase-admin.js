import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const LEGACY_MANAGEMENT = new Map([
  ["tafarel@platino.com", "admin"],
  ["tafarel.moreira@platino.com", "admin"],
  ["tafarelmoreira@platino.com", "admin"],
  ["isabela@platino.com", "manager"],
  ["vanessa@platino.com", "manager"],
]);

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin não configurado na hospedagem.");
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

function authenticationError(cause) {
  const code = String(cause?.code || "");
  const message = String(cause?.message || "");
  const configurationMismatch = /incorrect [`']?(aud|iss)[`']? claim|project id|securetoken\.google\.com/i.test(message);
  let error;

  if (message.includes("Firebase Admin não configurado")) {
    error = new Error("O servidor do SDR ainda não está configurado para validar acessos.");
    error.status = 503;
    error.expose = true;
  } else if (configurationMismatch) {
    error = new Error("A autenticação do SDR está ligada a um projeto Firebase diferente do sistema.");
    error.status = 503;
    error.expose = true;
  } else if ([
    "app/invalid-credential",
    "app/network-error",
    "app/network-timeout",
    "auth/invalid-credential",
    "auth/internal-error",
    "auth/server-unavailable"
  ].includes(code)) {
    error = new Error("O servidor do SDR não conseguiu validar o acesso no Firebase. Tente novamente em instantes.");
    error.status = 503;
    error.expose = true;
  } else if (code === "auth/user-disabled") {
    error = new Error("Este usuário está inativo. Fale com a gestão para liberar o acesso.");
    error.status = 403;
  } else {
    error = new Error("Sessão inválida ou expirada. Entre novamente e tente salvar o lead.");
    error.status = 401;
  }

  error.cause = cause;
  return error;
}

export async function requireAuthenticated(request) {
  const authorization = String(request.headers?.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    const error = new Error("Faça login para continuar.");
    error.status = 401;
    throw error;
  }
  try {
    // A verificação criptográfica já valida assinatura, projeto, emissão e
    // expiração. O segundo argumento `true` fazia uma chamada adicional ao
    // Firebase Auth em toda ação do SDR; falhas nessa chamada eram tratadas
    // incorretamente como sessão expirada e impediam o salvamento de tokens
    // válidos. Tokens Firebase expiram em até uma hora e o perfil inativo é
    // conferido novamente pelo próprio endpoint do SDR.
    return await adminAuth().verifyIdToken(token);
  } catch (cause) {
    const code = String(cause?.code || "");
    const message = String(cause?.message || "");
    console.error("Falha na autenticação da API:", code || message);
    throw authenticationError(cause);
  }
}

export async function requireManagement(request) {
  const actor = await requireAuthenticated(request);
  const email = String(actor.email || "").toLowerCase();
  const role = actor.role || LEGACY_MANAGEMENT.get(email);
  if (role !== "admin" && role !== "manager") {
    const error = new Error("Acesso restrito à gestão.");
    error.status = 403;
    throw error;
  }

  // Migração automática: no primeiro uso seguro da API, a conta legada recebe
  // a claim definitiva sem depender de Cloud Functions.
  if (!actor.role && LEGACY_MANAGEMENT.has(email)) {
    const user = await adminAuth().getUser(actor.uid);
    await adminAuth().setCustomUserClaims(actor.uid, {
      ...(user.customClaims || {}),
      role,
    });
    await adminDb().collection("users").doc(actor.uid).set({
      displayName: user.displayName || email.split("@")[0],
      email,
      photoURL: user.photoURL || "",
      avatarDataUrl: "",
      role,
      disabled: user.disabled,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "legacy-management-migration",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { uid: actor.uid, email, role };
}

export function assertPost(request, response) {
  if (request.method === "POST") return true;
  response.setHeader("Allow", "POST");
  response.status(405).json({ error: "Método não permitido." });
  return false;
}

export function sendApiError(response, error) {
  console.error(error);
  const status = Number(error?.status) || 500;
  const safeMessage = status < 500 || error?.expose === true
    ? error.message
    : "Não foi possível concluir a operação.";
  return response.status(status).json({ error: safeMessage });
}

export async function writeAudit(action, actor, targetUid, details = {}) {
  await adminDb().collection("adminAudit").add({
    action,
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetUid,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}
