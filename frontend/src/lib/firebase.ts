import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from "firebase/auth";

let app: FirebaseApp;
let db: Firestore;
let auth: Auth | null = null;

const useAnonAuth = (import.meta.env.VITE_ENABLE_ANON_AUTH || "").toLowerCase() === "true";

let authReady: Promise<void> = Promise.resolve();
let resolveAuthReady: (() => void) | null = null;
if (useAnonAuth) {
  authReady = new Promise<void>((resolve) => (resolveAuthReady = resolve));
}

export function getFirebase() {
  if (!getApps().length) {
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    } as const;

    app = initializeApp(config as any);
    db = getFirestore(app);

    if (useAnonAuth) {
      const a = getAuth(app);
      auth = a;
      onAuthStateChanged(a, (user) => {
        if (user) {
          if (resolveAuthReady) {
            resolveAuthReady();
            resolveAuthReady = null;
          }
        } else {
          // No user yet: start anonymous sign-in, and wait for the next auth state
          signInAnonymously(a).catch(() => {});
        }
      });
    }
  }
  return { app, db, auth };
}

export { authReady };

export function getScopeId(): string {
  // Prefer authenticated uid, else fall back to per-device clientId (not secure)
  if (useAnonAuth) {
    const { auth } = getFirebase();
    const uid = auth?.currentUser?.uid;
    if (uid) return uid;
  }
  const key = "habittracker:clientId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
