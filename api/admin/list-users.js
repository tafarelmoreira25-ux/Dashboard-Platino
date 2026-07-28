import {
  adminAuth,
  adminDb,
  assertPost,
  requireManagement,
  sendApiError,
} from "../_firebase-admin.js";

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

export default async function handler(request, response) {
  if (!assertPost(request, response)) return;
  response.setHeader("Cache-Control", "no-store");
  try {
    await requireManagement(request);
    const [authUsers, profilesSnapshot] = await Promise.all([
      listAllAuthUsers(),
      adminDb().collection("users").get(),
    ]);
    const profiles = new Map(profilesSnapshot.docs.map((item) => [item.id, item.data()]));
    const users = authUsers.map((user) => {
      const profile = profiles.get(user.uid) || {};
      return {
        id: user.uid,
        displayName: profile.displayName || user.displayName || user.email?.split("@")[0] || "Usuário",
        email: user.email || profile.email || "",
        role: user.customClaims?.role || profile.role || "collaborator",
        operationalRole: user.customClaims?.operationalRole || profile.operationalRole || "collaborator",
        sector: user.customClaims?.sector || profile.sector || "",
        availabilityStatus: profile.availabilityStatus || "",
        disabled: user.disabled,
        profileSynced: profiles.has(user.uid),
        createdAt: user.metadata.creationTime || null,
        lastSignInAt: user.metadata.lastSignInTime || null,
      };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    return response.status(200).json({ users, total: users.length });
  } catch (error) {
    return sendApiError(response, error);
  }
}
