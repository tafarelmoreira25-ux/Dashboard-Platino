import { FieldValue } from "firebase-admin/firestore";
import {
  adminAuth,
  adminDb,
  assertPost,
  requireManagement,
  sendApiError,
  writeAudit
} from "../_firebase-admin.js";

const VALID_ROLES = new Set(["sdr", "consultant", "analyst", "collaborator", "manager"]);

export default async function handler(request, response) {
  if (!assertPost(request, response)) return;
  response.setHeader("Cache-Control", "no-store");
  try {
    const actor = await requireManagement(request);
    const uid = typeof request.body?.uid === "string" ? request.body.uid.trim() : "";
    const operationalRole = typeof request.body?.operationalRole === "string"
      ? request.body.operationalRole.trim().toLowerCase()
      : "";
    const sector = typeof request.body?.sector === "string" ? request.body.sector.trim().slice(0, 80) : "";
    if (!uid || !VALID_ROLES.has(operationalRole)) {
      const error = new Error("Usuário ou perfil operacional inválido.");
      error.status = 400;
      throw error;
    }
    if (operationalRole === "manager" && actor.role !== "admin") {
      const error = new Error("Somente um admin pode atribuir o perfil de gestor.");
      error.status = 403;
      throw error;
    }
    const user = await adminAuth().getUser(uid);
    await adminAuth().setCustomUserClaims(uid, {
      ...(user.customClaims || {}),
      operationalRole,
      sector
    });
    await adminDb().collection("users").doc(uid).set({
      operationalRole,
      sector,
      isActive: !user.disabled,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAudit("user.operational-role.update", actor, uid, {
      email: user.email || null,
      operationalRole,
      sector
    });
    return response.status(200).json({ uid, operationalRole, sector });
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      error.status = 404;
      error.message = "Conta não encontrada.";
    }
    return sendApiError(response, error);
  }
}
