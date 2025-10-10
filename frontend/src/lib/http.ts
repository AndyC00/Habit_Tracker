import { API_BASE } from "./api";

// common HTTP requests pack up
export async function http<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    // try read error and throw
    const msg = await safeText(res);
    throw new Error(msg || `HTTP ${res.status}`);
  }

  // 204 or no content will return undefined
  if (res.status === 204) return undefined as T;

  // parse JSON if possible
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
    // otherwise return text
  return (await res.text()) as unknown as T;
}

async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}
