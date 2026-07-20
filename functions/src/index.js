import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

initializeApp();

const REGION = "southamerica-east1";
const VALID_ROLES = new Set(["admin", "manager", "collaborator"]);

function requireManagement(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const role = request.auth.token.role;
  if (role !== "admin" && role !== "manager") {
    throw new HttpsError("permission-denied", "Acesso restrito à gestão.");
  }
  return { uid: request.auth.uid, role, email: request.auth.token.email ?? null };
}

function cleanText(value, field, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new HttpsError("invalid-argument", `${field} é obrigatório e deve ter até ${maxLength} caracteres.`);
  }
  return text;
}

function normalizeEmail(value) {
  const email = cleanText(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  }
  return email;
}

async function writeAudit(action, actor, targetUid, details = {}) {
  await getFirestore().collection("adminAudit").add({
    action,
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetUid,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const createManagedUser = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const actor = requireManagement(request);
    const displayName = cleanText(request.data?.displayName, "Nome", 120);
    const email = normalizeEmail(request.data?.email);
    const password = request.data?.password;
    const role = request.data?.role ?? "collaborator";

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      throw new HttpsError("invalid-argument", "A senha temporária deve ter entre 8 e 128 caracteres.");
    }
    if (!VALID_ROLES.has(role)) {
      throw new HttpsError("invalid-argument", "Nível de acesso inválido.");
    }
    if (role !== "collaborator" && actor.role !== "admin") {
      throw new HttpsError("permission-denied", "Somente um admin pode criar outra conta de gestão.");
    }

    let createdUser;
    try {
      createdUser = await getAuth().createUser({
        email,
        password,
        displayName,
        emailVerified: false,
        disabled: false,
      });
      await getAuth().setCustomUserClaims(createdUser.uid, { role });

      await getFirestore().collection("users").doc(createdUser.uid).set({
        displayName,
        email,
        photoURL: "",
        role,
        disabled: false,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAudit("user.create", actor, createdUser.uid, { email, role });

      return { uid: createdUser.uid, email, displayName, role, disabled: false };
    } catch (error) {
      // Evita usuário órfão no Auth caso a gravação do perfil falhe.
      if (createdUser?.uid) {
        await getAuth().deleteUser(createdUser.uid).catch((rollbackError) => {
          logger.error("Falha no rollback do usuário", { uid: createdUser.uid, rollbackError });
        });
        await getFirestore().collection("users").doc(createdUser.uid).delete().catch((rollbackError) => {
          logger.error("Falha no rollback do perfil", { uid: createdUser.uid, rollbackError });
        });
      }
      logger.error("Falha ao criar usuário gerenciado", error);
      if (error instanceof HttpsError) throw error;
      if (error?.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "Já existe uma conta com este e-mail.");
      }
      throw new HttpsError("internal", "Não foi possível criar a conta.");
    }
  },
);

export const setManagedUserDisabled = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const actor = requireManagement(request);
    const uid = cleanText(request.data?.uid, "UID", 128);
    const disabled = request.data?.disabled;

    if (typeof disabled !== "boolean") {
      throw new HttpsError("invalid-argument", "O campo disabled deve ser booleano.");
    }
    if (uid === actor.uid) {
      throw new HttpsError("failed-precondition", "Você não pode desabilitar a própria conta.");
    }

    const target = await getAuth().getUser(uid).catch((error) => {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "Conta não encontrada.");
      }
      throw error;
    });
    const targetRole = target.customClaims?.role ?? "collaborator";
    if (targetRole !== "collaborator" && actor.role !== "admin") {
      throw new HttpsError("permission-denied", "Somente um admin pode alterar outra conta de gestão.");
    }

    await getAuth().updateUser(uid, { disabled });
    await getFirestore().collection("users").doc(uid).set({
      disabled,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAudit(disabled ? "user.disable" : "user.enable", actor, uid, {
      email: target.email ?? null,
      role: targetRole,
    });

    return { uid, disabled };
  },
);

// Execute uma única vez, em ambiente confiável, para promover os gestores
// iniciais. Depois, toda autorização passa a vir do token assinado.
export const bootstrapManagementClaims = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (!request.auth || request.auth.token.role !== "admin") {
      throw new HttpsError("permission-denied", "Somente o admin raiz pode promover contas.");
    }
    const uid = cleanText(request.data?.uid, "UID", 128);
    const role = request.data?.role;
    if (role !== "admin" && role !== "manager") {
      throw new HttpsError("invalid-argument", "A claim deve ser admin ou manager.");
    }
    await getAuth().setCustomUserClaims(uid, { role });
    await getFirestore().collection("users").doc(uid).set({
      role,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { uid, role };
  },
);
