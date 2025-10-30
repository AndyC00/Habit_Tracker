import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

let app: FirebaseApp;
let db: Firestore;

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

    // Basic validation to help during setup
    const missing = Object.entries(config)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `Firebase config missing envs: ${missing.join(", ")}. Add them to your .env`,
      );
    }

    app = initializeApp(config as any);
    db = getFirestore(app);
  }
  return { app, db };
}

export function getClientId(): string {
  const key = "habittracker:clientId";
  let id = localStorage.getItem(key);
  if (!id) {
    // Lightweight random ID (sufficient for per-device partitioning without auth)
    id = `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

