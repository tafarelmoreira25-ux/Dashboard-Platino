export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({
      error: "Method not allowed."
    });
  }

  // A configuração web é pública e usa os mesmos valores de contingência do
  // frontend. Assim, a ausência de uma variável web opcional na hospedagem não
  // faz o navegador iniciar em um projeto diferente do Firebase Admin.
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAHy9YPTluXfSFqpJ3lFB7lTO555gmeCKA",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "platino-hub.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "platino-hub",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "platino-hub.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1043378575903",
    appId: process.env.FIREBASE_APP_ID
  };

  const requiredConfig = {
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId
  };

  const missingKeys = Object.entries(requiredConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length) {
    return response.status(500).json({
      error: "Firebase configuration is missing.",
      missing: missingKeys
    });
  }

  const invalidKeys = [];
  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(String(firebaseConfig.apiKey))) invalidKeys.push("apiKey");
  if (!/^[a-z0-9-]+\.firebaseapp\.com$/i.test(String(firebaseConfig.authDomain))) invalidKeys.push("authDomain");
  if (!/^[a-z0-9-]{4,}$/i.test(String(firebaseConfig.projectId))) invalidKeys.push("projectId");
  if (firebaseConfig.messagingSenderId && !/^\d{6,}$/.test(String(firebaseConfig.messagingSenderId))) invalidKeys.push("messagingSenderId");
  if (firebaseConfig.appId && !/^1:\d+:web:[0-9A-Za-z]+$/.test(String(firebaseConfig.appId))) invalidKeys.push("appId");
  if (invalidKeys.length) {
    return response.status(500).json({
      error: "Firebase configuration is invalid.",
      invalid: invalidKeys
    });
  }

  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json(
    Object.fromEntries(Object.entries(firebaseConfig).filter(([, value]) => Boolean(value)))
  );
}
