import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User} from "firebase/auth";
import { getFirebase } from "./firebase";

// Use a local-only auth flow when running the Vite dev server so the app works without Firebase config.
const USE_LOCAL_AUTH = typeof window !== "undefined" && window.location.origin === "http://localhost:5173";
const LOCAL_AUTH_KEY = "habittracker:local-auth";
type LocalAuthState = { uid: string; email: string; password: string };
const localAuthListeners: Array<(user: User | null) => void> = [];

function readLocalAuth(): LocalAuthState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalAuthState;
  } catch {
    return null;
  }
}

function writeLocalAuth(state: LocalAuthState | null) {
  if (typeof window === "undefined") return;
  if (!state) localStorage.removeItem(LOCAL_AUTH_KEY);
  else localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(state));
}

function toUser(state: LocalAuthState): User {
  return { uid: state.uid, email: state.email } as unknown as User;
}

function notifyLocalListeners(user: User | null) {
  for (const cb of localAuthListeners) cb(user);
}

export async function register(email: string, password: string): Promise<User> {
    if (USE_LOCAL_AUTH) {
        const normalizedEmail = email.trim().toLowerCase();
        const state: LocalAuthState = {
          uid: `local-${normalizedEmail || "user"}`,
          email: normalizedEmail,
          password,
        };
        writeLocalAuth(state);
        const user = toUser(state);
        notifyLocalListeners(user);
        return user;
    }

    const { auth } = getFirebase();
    const result = await createUserWithEmailAndPassword(auth, email, password);

    return result.user;
}

export async function login(email: string, password: string): Promise<User> {
    if (USE_LOCAL_AUTH) {
        const stored = readLocalAuth();
        if (!stored) throw new Error("No local account found. Please register first.");
        if (stored.email !== email.trim().toLowerCase() || stored.password !== password) {
          throw new Error("Invalid email or password.");
        }
        const user = toUser(stored);
        notifyLocalListeners(user);
        return user;
    }

    const { auth } = getFirebase();
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
}

export async function logout(): Promise<void> {
    if (USE_LOCAL_AUTH) {
        writeLocalAuth(null);
        notifyLocalListeners(null);
        return;
    }

    const { auth } = getFirebase();
    await signOut(auth);
}

// listen for auth state changes, callback will be triggered when login/logout occurs
export function onAuthChange(callback: (user: User | null) => void): () => void {
    if (USE_LOCAL_AUTH) {
        const listener = (user: User | null) => callback(user);
        localAuthListeners.push(listener);
        // Immediately emit current state for local mode
        const state = readLocalAuth();
        callback(state ? toUser(state) : null);
        return () => {
          const idx = localAuthListeners.indexOf(listener);
          if (idx >= 0) localAuthListeners.splice(idx, 1);
        };
    }

    const { auth } = getFirebase();
    const unsubscribe = onAuthStateChanged(auth, callback);
    return unsubscribe;
}
