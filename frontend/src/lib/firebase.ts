import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { initializeFirestore, type Firestore } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

const useAnonAuth = (import.meta.env.VITE_ENABLE_ANON_AUTH || "").toLowerCase() === "true";
const firestoreSettings = {
  // Force HTTP long polling to avoid QUIC idle timeouts seen on some networks
  experimentalForceLongPolling: true,
  useFetchStreams: false,
} as const;

let authReady: Promise<void> = Promise.resolve();
if (useAnonAuth) {
  authReady = new Promise<void>((resolve) => {
    const { auth } = getFirebase();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribe();
        resolve();
      }
    });
    // Trigger anonymous sign-in if not already authenticated
    signInAnonymously(auth).catch(() => {
      // ignore; auth state listener will handle resolution when applicable
    });
  });
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
    db = initializeFirestore(app, firestoreSettings);
    auth = getAuth(app);
    // Ensure auth state persists across tabs and reloads (explicitly set)
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  }
  return { app, db, auth };
}

export { authReady };

export function getScopeId(): string {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.uid;
}
