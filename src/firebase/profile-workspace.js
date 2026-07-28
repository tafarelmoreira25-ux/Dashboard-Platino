import { updateProfile } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

function requireUser(auth) {
  if (!auth.currentUser) throw new Error("Faça login para continuar.");
  return auth.currentUser;
}

function profileRef(db, uid) {
  return doc(db, "users", uid);
}

function remindersRef(db, uid) {
  return collection(db, "users", uid, "reminders");
}

export async function ensureOwnProfile({ auth, db }) {
  const user = requireUser(auth);
  const reference = profileRef(db, user.uid);
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) return snapshot.data();
  const profile = {
    displayName: user.displayName || user.email?.split("@")[0] || "Colaborador",
    email: user.email || "",
    photoURL: "",
    avatarDataUrl: "",
    role: "collaborator",
    disabled: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
  };
  await setDoc(reference, profile);
  return profile;
}

export async function saveDisplayName({ auth, db }, rawName) {
  const user = requireUser(auth);
  const displayName = rawName.trim();
  if (!displayName || displayName.length > 120) {
    throw new Error("O nome deve ter entre 1 e 120 caracteres.");
  }
  await ensureOwnProfile({ auth, db });
  await updateProfile(user, { displayName });
  await updateDoc(profileRef(db, user.uid), {
    displayName,
    updatedAt: serverTimestamp(),
  });
  return displayName;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a imagem."));
    };
    image.src = objectUrl;
  });
}

async function createAvatarDataUrl(file) {
  const image = await loadImage(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - cropSize) / 2;
  const sourceY = (image.naturalHeight - cropSize) / 2;
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);
  const dataUrl = canvas.toDataURL("image/webp", 0.78);
  if (dataUrl.length > 180000) {
    throw new Error("A foto não pôde ser compactada. Escolha uma imagem mais simples.");
  }
  return dataUrl;
}

export async function uploadProfilePhoto({ auth, db }, file) {
  const user = requireUser(auth);
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file?.type) || file.size > 10 * 1024 * 1024) {
    throw new Error("Envie JPG, PNG ou WebP com no máximo 10 MB.");
  }

  await ensureOwnProfile({ auth, db });
  const avatarDataUrl = await createAvatarDataUrl(file);
  await updateDoc(profileRef(db, user.uid), {
    avatarDataUrl,
    updatedAt: serverTimestamp(),
  });
  return avatarDataUrl;
}

export async function removeProfilePhoto({ auth, db }) {
  const user = requireUser(auth);
  await ensureOwnProfile({ auth, db });
  await updateDoc(profileRef(db, user.uid), {
    photoURL: "",
    avatarDataUrl: "",
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToReminders({ auth, db }, callback, onError = console.error) {
  const user = requireUser(auth);
  const q = query(remindersRef(db, user.uid), orderBy("dueAt", "asc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function createReminder(
  { auth, db },
  { title, notes = "", dueAt, type = "task", priority = "normal", notify = true }
) {
  const user = requireUser(auth);
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("Informe um título com até 200 caracteres.");
  if (notes.length > 4000) throw new Error("A anotação deve ter até 4.000 caracteres.");
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) throw new Error("Informe uma data válida.");
  if (!["task", "reminder", "goal", "note"].includes(type)) throw new Error("Tipo de registro inválido.");
  if (!["normal", "high", "urgent"].includes(priority)) throw new Error("Prioridade inválida.");

  const reference = await addDoc(remindersRef(db, user.uid), {
    title: cleanTitle,
    notes: notes.trim(),
    dueAt: Timestamp.fromDate(date),
    completed: false,
    type,
    priority,
    notify: Boolean(notify),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function updateReminder({ auth, db }, reminderId, patch) {
  const user = requireUser(auth);
  const allowed = {};
  if ("title" in patch) {
    allowed.title = patch.title.trim();
    if (!allowed.title || allowed.title.length > 200) throw new Error("Título inválido.");
  }
  if ("notes" in patch) {
    allowed.notes = patch.notes.trim();
    if (allowed.notes.length > 4000) throw new Error("Anotação muito longa.");
  }
  if ("dueAt" in patch) {
    const date = patch.dueAt instanceof Date ? patch.dueAt : new Date(patch.dueAt);
    if (Number.isNaN(date.getTime())) throw new Error("Data inválida.");
    allowed.dueAt = Timestamp.fromDate(date);
  }
  if ("completed" in patch) allowed.completed = Boolean(patch.completed);
  if ("type" in patch && ["task", "reminder", "goal", "note"].includes(patch.type)) allowed.type = patch.type;
  if ("priority" in patch && ["normal", "high", "urgent"].includes(patch.priority)) allowed.priority = patch.priority;
  if ("notify" in patch) allowed.notify = Boolean(patch.notify);
  await updateDoc(doc(db, "users", user.uid, "reminders", reminderId), {
    ...allowed,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReminder({ auth, db }, reminderId) {
  const user = requireUser(auth);
  await deleteDoc(doc(db, "users", user.uid, "reminders", reminderId));
}

export function getDueReminders(items, now = new Date()) {
  return items.filter((item) =>
    !item.completed && item.dueAt?.toDate?.().getTime() <= now.getTime()
  );
}

async function callManagementApi(auth, path, body) {
  const user = requireUser(auth);
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}

export function createAccountManagementApi(auth) {
  return {
    listUsers: () => callManagementApi(auth, "/api/admin/list-users", {}),
    createUser: (form) => callManagementApi(auth, "/api/admin/create-user", form),
    setDisabled: (uid, disabled) =>
      callManagementApi(auth, "/api/admin/set-user-disabled", { uid, disabled }),
    setOperationalRole: (uid, operationalRole, sector) =>
      callManagementApi(auth, "/api/admin/set-user-operational-role", { uid, operationalRole, sector }),
  };
}
