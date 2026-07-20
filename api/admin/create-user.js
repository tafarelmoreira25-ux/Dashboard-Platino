import { FieldValue } from "firebase-admin/firestore";
import {
  adminAuth,
  adminDb,
  assertPost,
  requireManagement,
  sendApiError,
  writeAudit,
} from "../_firebase-admin.js";

const VALID_ROLES = new Set(["admin", "manager", "collaborator"]);

function requiredText(value, label, max) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) {
    const error = new Error(`${label} é obrigatório e deve ter até ${max} caracteres.`);
    error.status = 400;
    throw error;
  }
  return text;
}

export default async function handler(request, response) {
  if (!assertPost(request, response)) return;
  response.setHeader("Cache-Control", "no-store");

  let createdUser;
  try {
    const actor = await requireManagement(request);
    const displayName = requiredText(request.body?.displayName, "Nome", 120);
    const email = requiredText(request.body?.email, "E-mail", 254).toLowerCase();
    const password = request.body?.password;
    const role = request.body?.role || "collaborator";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const error = new Error("Informe um e-mail válido.");
      error.status = 400;
      throw error;
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      const error = new Error("A senha temporária deve ter entre 8 e 128 caracteres.");
      error.status = 400;
      throw error;
    }
    if (!VALID_ROLES.has(role)) {
      const error = new Error("Nível de acesso inválido.");
      error.status = 400;
      throw error;
    }
    if (role !== "collaborator" && actor.role !== "admin") {
      const error = new Error("Somente um admin pode criar outra conta de gestão.");
      error.status = 403;
      throw error;
    }

    createdUser = await adminAuth().createUser({
      displayName,
      email,
      password,
      emailVerified: false,
      disabled: false,
    });
    await adminAuth().setCustomUserClaims(createdUser.uid, { role });
    await adminDb().collection("users").doc(createdUser.uid).set({
      displayName,
      email,
      photoURL: "",
      avatarDataUrl: "",
      role,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writeAudit("user.create", actor, createdUser.uid, { email, role });
    return response.status(201).json({
      uid: createdUser.uid,
      displayName,
      email,
      role,
      disabled: false,
    });
  } catch (error) {
    if (createdUser?.uid) {
      await adminAuth().deleteUser(createdUser.uid).catch(console.error);
      await adminDb().collection("users").doc(createdUser.uid).delete().catch(console.error);
    }
    if (error?.code === "auth/email-already-exists") {
      error.status = 409;
      error.message = "Já existe uma conta com este e-mail.";
    }
    return sendApiError(response, error);
  }
}
