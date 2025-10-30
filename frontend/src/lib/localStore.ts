// Backend API store: all data CRUD goes to the ASP.NET backend.
import { http } from "./http";

const NS = "habittracker:v1"; // keep for optional local export/import if needed

export type Habit = {
  id: number;
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
  isArchived: boolean;
  createdUtc?: string;
};

export type CheckIn = {
  id: number;
  habitId: number;
  localDate: string; // yyyy-MM-dd
  durationMinutes?: number | null;
  createdUtc?: string;
};

export type Stats = {
  completedThisMonth: number;
  completedTotal: number;
  longestStreak: number;
  totalDurationMinutes: number;
  durationThisMonth: number;
  hasTodayCheckIn: boolean;
  todayDurationMinutes: number | null;
};

// ---------- helpers ----------
function todayInTZISO(tz?: string): string {
  const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;

  return `${y}-${m}-${d}`;
}

function isoToEpochDays(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
}

function addDaysISO(iso: string, delta: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + delta * 86400000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ---------- Habit ----------
export async function listHabits(includeArchived = false): Promise<Habit[]> {
  const q = includeArchived ? "?includeArchived=true" : "";
  const list = await http<Habit[]>(`/api/habits${q}`);
  return list;
}

export async function createHabit(payload: {
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
}): Promise<Habit> {
  if (!payload.name?.trim()) throw new Error("Name is required.");

  const created = await http<Habit>(`/api/habits`, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name.trim(),
      description: payload.description ?? null,
      colorHex: payload.colorHex ?? null,
      iconKey: payload.iconKey ?? null,
    }),
  });
  return created;
}

export async function updateHabit(
  id: number,
  payload: {
    name: string;
    description?: string | null;
    colorHex?: string | null;
    iconKey?: string | null;
    isArchived: boolean;
  },
): Promise<Habit> {
  const updated = await http<Habit>(`/api/habits/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: payload.name.trim(),
      description: payload.description ?? null,
      colorHex: payload.colorHex ?? null,
      iconKey: payload.iconKey ?? null,
      isArchived: !!payload.isArchived,
    }),
  });
  return updated;
}

// ---------- Check-in ----------
export async function upsertCheckIn(
  habitId: number,
  body: { localDate: string; durationMinutes?: number | null; userTimeZoneIana?: string },
): Promise<CheckIn> {
  const updated = await http<CheckIn>(`/api/habits/${habitId}/checkins`, {
    method: "POST",
    body: JSON.stringify({
      localDate: body.localDate,
      durationMinutes: body.durationMinutes ?? null,
      userTimeZoneIana: body.userTimeZoneIana,
    }),
  });
  return updated;
}

export async function deleteCheckIn(habitId: number, localDate: string): Promise<void> {
  await http<void>(`/api/habits/${habitId}/checkins/${localDate}`, { method: "DELETE" });
}

// ---------- Stats ----------
export async function getStats(
  habitId: number,
  month?: string,
  tz?: string,
): Promise<Stats> {
  const s = await http<Stats>(`/api/habits/${habitId}/stats?${new URLSearchParams({ month: month ?? "", tz: tz ?? "" })}`);

  return s;
}

// ---------- Series (for charts) ----------
export async function getRecentSeries(
  habitId: number,
  days: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const points = await http<{ date: string; minutes: number }[]>(`/api/habits/${habitId}/checkins`);
  const sorted = points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const latest = sorted.length > 0 ? sorted[sorted.length - 1].date : todayInTZISO(timeZone);
  const start = addDaysISO(latest, -(days - 1));

  const map = new Map<string, number>();
  for (const p of sorted) {
    map.set(p.date, p.minutes ?? 0);
  }

  const result: { date: string; minutes: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i);
    const v = map.get(d);
    result.push({ date: d, minutes: v ?? 0 });
  }

  return result; // oldest -> newest
}

export async function getMonthSeries(
  habitId: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Use backend calendar endpoint for the current month of the latest check-in (or today)
  const all = await http<{ date: string; minutes: number }[]>(`/api/habits/${habitId}/checkins`);
  const latest = all.length > 0 ? all[all.length - 1].date : todayInTZISO(timeZone);
  const y = Number(latest.slice(0, 4));
  const m = Number(latest.slice(5, 7));
  const monthKey = latest.slice(0, 7);
  const start = `${monthKey}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();

  // Prefer server calendar for consistency
  const cal = await http<{ date: string; checked: boolean; durationMinutes: number | null }[]>(
    `/api/habits/${habitId}/calendar?month=${monthKey}`
  );
  const map = new Map<string, number>();
  for (const c of cal) map.set(c.date, c.durationMinutes ?? 0);

  const result: { date: string; minutes: number }[] = [];
  // Only include days that have "arrived". If this month is the current month (in tz),
  // cut off at today; otherwise include full month.
  const today = todayInTZISO(timeZone);
  const isCurrentMonth = today.slice(0, 7) === monthKey;
  const endDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth;
  for (let i = 0; i < endDay; i++) {
    const d = addDaysISO(start, i);
    const v = map.get(d);
    result.push({ date: d, minutes: v ?? 0 });
  }

  return result; // oldest -> newest within month
}

export async function getTotalSeries(
  habitId: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const points = await http<{ date: string; minutes: number }[]>(`/api/habits/${habitId}/checkins`);
  const checks = points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (checks.length === 0) return [];

  const start = checks[0].date;
  const end = checks[checks.length - 1].date;
  const days = isoToEpochDays(end) - isoToEpochDays(start) + 1;

  const map = new Map<string, number>();
  for (const p of checks) map.set(p.date, p.minutes ?? 0);

  const result: { date: string; minutes: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i);
    const v = map.get(d);
    result.push({ date: d, minutes: v ?? 0 });
  }

  return result; // oldest -> newest over full range
}

// ---------- export/import for backup (local only) ----------
export function exportJson(): string {
  return localStorage.getItem(NS) ?? "";
}

export function importJson(json: string) {
  localStorage.setItem(NS, json);
}

// Optional: one-time migration from local backup JSON (NS) to Firestore
// Call this manually in dev console if needed: await store.migrateLocalBackupToCloud()
export async function migrateLocalBackupToCloud(): Promise<{ habits: number; checkins: number }> {
  return { habits: 0, checkins: 0 };
}
