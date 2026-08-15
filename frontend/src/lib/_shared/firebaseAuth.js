const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

class RequestAuthenticationError extends Error {}

function getFirebaseAdminAuth() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Firebase Admin credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
      );
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }

  return getAuth();
}

async function requireFirebaseUser(event) {
  if (process.env.NETLIFY_DEV === "true") {
    return { uid: "netlify-local-dev" };
  }

  const authorization = event.headers.authorization || event.headers.Authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new RequestAuthenticationError("Authentication required.");
  }

  const idToken = authorization.slice("Bearer ".length);
  const adminAuth = getFirebaseAdminAuth();
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    console.error("Firebase ID token verification failed:", error);
    throw new RequestAuthenticationError("Invalid or expired authentication token.");
  }
}

module.exports = {
  RequestAuthenticationError,
  requireFirebaseUser,
};
