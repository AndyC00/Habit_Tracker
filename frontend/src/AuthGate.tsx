import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthChange, login, register } from "./lib/auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed");
    }
  }

  if (loading) return <div>Loading authentication…</div>;
  if (!user) {
    return (
      <div className="auth-container">
        <h2>{mode === "login" ? "Sign In" : "Register"}</h2>
        <form onSubmit={handleSubmit} autoComplete="on">
          <label>Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>Password
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">{mode === "login" ? "Sign In" : "Register"}</button>
        </form>
        {mode === "login" ? (
          <p>New user? <button onClick={() => setMode("register")}>Create an account</button></p>
        ) : (
          <p>Already have an account? <button onClick={() => setMode("login")}>Sign in</button></p>
        )}
      </div>
    );
  }
  // render children(the app) if authenticated
  return <>{children}</>;
}
