import { FieldValue } from "firebase-admin/firestore";
import {
  adminAuth,
  adminDb,
  assertPost,
  requireManagement,
  sendApiError,
  writeAudit,
} from "../_firebase-admin.js";

export default async function handler(request, response) {
  if (!assertPost(request, response)) return;
  response.setHeader("Cache-Control", "no-store");

  try {
    const actor = await requireManagement(request);
    const uid = typeof request.body?.uid === "string" ? request.body.uid.trim() : "";
    const disabled = request.body?.disabled;
    if (!uid || uid.length > 128 || typeof disabled !== "boolean") {
      const error = new Error("UID ou estado da conta inválido.");
      error.status = 400;
      throw error;
    }
    if (uid === actor.uid) {
      const error = new Error("Você não pode desabilitar a própria conta.");
      error.status = 409;
      throw error;
    }

    const target = await adminAuth().getUser(uid);
    const targetRole = target.customClaims?.role || "collaborator";
    if (targetRole !== "collaborator" && actor.role !== "admin") {
      const error = new Error("Somente um admin pode alterar outra conta de gestão.");
      error.status = 403;
      throw error;
    }

    await adminAuth().updateUser(uid, { disabled });
    await adminDb().collection("users").doc(uid).set({
      disabled,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAudit(disabled ? "user.disable" : "user.enable", actor, uid, {
      email: target.email || null,
      role: targetRole,
    });
    return response.status(200).json({ uid, disabled });
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      error.status = 404;
      error.message = "Conta não encontrada.";
    }
    return sendApiError(response, error);
  }
}
