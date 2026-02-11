export type ReminderFrequency = "daily" | "weekly";

export type ReminderPayload = {
  habitId: number;
  habitName: string;
  enabled: boolean;
  frequency: ReminderFrequency;
  timeOfDay: string; // HH:mm (24h)
  daysOfWeek?: number[];
  timeZone: string;
};

export type Reminder = ReminderPayload & {
  id: number;
  nextRunUtc: string;
  lastSentUtc?: string | null;
};

export type ReminderNotification = {
  id: number;
  habitId: number;
  message: string;
  scheduledLocal: string;
  createdUtc: string;
  readAtUtc: string | null;
};

const BASE = (import.meta.env.VITE_REMINDER_API_BASE || "http://localhost:6060").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}

export async function health(): Promise<boolean> {
  try {
    await request("/api/health");
    return true;
  } catch {
    return false;
  }
}

export async function getReminderByHabitId(habitId: number): Promise<Reminder | null> {
  try {
    return await request<Reminder>(`/api/reminders?habitId=${habitId}`);
  } catch (e: any) {
    if (String(e?.message || "").includes("404")) return null;
    throw e;
  }
}

export async function upsertReminder(payload: ReminderPayload): Promise<Reminder> {
  const existing = await getReminderByHabitId(payload.habitId);
  const body = JSON.stringify({
    ...payload,
    // backend uses string enums
    frequency: payload.frequency === "weekly" ? "Weekly" : "Daily",
  });
  if (existing) {
    return await request<Reminder>(`/api/reminders/${existing.id}`, {
      method: "PUT",
      body,
    });
  }
  return await request<Reminder>("/api/reminders", {
    method: "POST",
    body,
  });
}

export async function deleteReminderByHabit(habitId: number): Promise<void> {
  const existing = await getReminderByHabitId(habitId);
  if (!existing) return;
  await request(`/api/reminders/${existing.id}`, { method: "DELETE" });
}

export async function listUnreadNotifications(): Promise<ReminderNotification[]> {
  return await request<ReminderNotification[]>("/api/notifications?status=unread");
}

export async function markNotificationRead(id: number): Promise<void> {
  await request(`/api/notifications/${id}/read`, { method: "POST" });
}
