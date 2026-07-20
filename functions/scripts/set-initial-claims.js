import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const assignments = new Map([
  ["tafarel@platino.com", "admin"],
  ["isabela@platino.com", "manager"],
  ["vanessa@platino.com", "manager"],
]);

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "platino-hub",
});

for (const [email, role] of assignments) {
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    role,
  });
  await getFirestore().collection("users").doc(user.uid).set({
    displayName: user.displayName || email.split("@")[0],
    email,
    photoURL: user.photoURL || "",
    role,
    disabled: user.disabled,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "initial-claims-script",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`${email}: ${role}`);
}

console.log("Claims iniciais configuradas. Os usuários devem entrar novamente ou renovar o ID token.");
