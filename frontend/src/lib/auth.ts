import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User} from "firebase/auth";
import { getFirebase } from "./firebase";


export async function register(email: string, password: string): Promise<User> {
    const { auth } = getFirebase();
    const result = await createUserWithEmailAndPassword(auth, email, password);

    return result.user;
}

export async function login(email: string, password: string): Promise<User> {
    const { auth } = getFirebase();
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
}

export async function logout(): Promise<void> {
    const { auth } = getFirebase();
    await signOut(auth);
}

// listen for auth state changes, callback will be triggered when login/logout occurs
export function onAuthChange(callback: (user: User | null) => void): () => void {
    const { auth } = getFirebase();
    const unsubscribe = onAuthStateChanged(auth, callback);
    return unsubscribe;
}