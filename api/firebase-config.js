export default function handler(request, response) {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID
  };

  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length) {
    return response.status(500).json({
      error: "Firebase configuration is missing.",
      missing: missingKeys
    });
  }

  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json(firebaseConfig);
}
