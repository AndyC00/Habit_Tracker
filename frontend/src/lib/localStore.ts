// Firebase-backed store in frontend (optional anon auth)
import { getFirebase, getScopeId, authReady } from "./firebase";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

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
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const snap = await getDocs(collection(db, "users", scope, "habits"));
  const all = snap.docs.map((d) => d.data() as Habit);
  const list = includeArchived ? all : all.filter((h) => !h.isArchived);
  return list.sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || a.id - b.id);
}

export async function createHabit(payload: {
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
}): Promise<Habit> {
  if (!payload.name?.trim()) throw new Error("Name is required.");

  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const existing = await listHabits(true);
  const nextId = existing.length ? Math.max(...existing.map((h) => h.id)) + 1 : 1;
  const habit: Habit = {
    id: nextId,
    name: payload.name.trim(),
    description: payload.description ?? null,
    colorHex: payload.colorHex ?? null,
    iconKey: payload.iconKey ?? null,
    isArchived: false,
    createdUtc: new Date().toISOString(),
  };
  await setDoc(doc(db, "users", scope, "habits", String(habit.id)), habit);
  return habit;
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
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const ref = doc(db, "users", scope, "habits", String(id));
  const snap = await getDoc(ref);
  const h = snap.exists() ? (snap.data() as Habit) : null;
  if (!h) throw new Error("Habit not found.");
  const updated: Habit = {
    ...h,
    name: payload.name.trim(),
    description: payload.description ?? null,
    colorHex: payload.colorHex ?? null,
    iconKey: payload.iconKey ?? null,
    isArchived: !!payload.isArchived,
  };
  await setDoc(ref, updated, { merge: true });
  return updated;
}

// ---------- Check-in ----------
export async function upsertCheckIn(
  habitId: number,
  body: { localDate: string; durationMinutes?: number | null; userTimeZoneIana?: string },
): Promise<CheckIn> {
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const tz = body.userTimeZoneIana || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTZISO(tz);
  const min = addDaysISO(today, -7);
  if (body.localDate < min || body.localDate > today) {
    throw new Error(`Only the last 7 days (including today ${today}) are allowed.`);
  }
  const ref = doc(db, "users", scope, "checkins", `${habitId}_${body.localDate}`);
  const snap = await getDoc(ref);
  const base: CheckIn = snap.exists()
    ? (snap.data() as CheckIn)
    : {
        id: parseInt(`${habitId}${body.localDate.replace(/-/g, "")}`, 10),
        habitId,
        localDate: body.localDate,
        durationMinutes: null,
        createdUtc: new Date().toISOString(),
      };
  const updated: CheckIn = { ...base, durationMinutes: body.durationMinutes ?? null };
  await setDoc(ref, updated);
  return updated;
}

export async function deleteCheckIn(habitId: number, localDate: string): Promise<void> {
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const ref = doc(db, "users", scope, "checkins", `${habitId}_${localDate}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("No check-in on that date.");
  await deleteDoc(ref);
}

// ---------- Stats ----------
export async function getStats(
  habitId: number,
  month?: string,
  tz?: string,
): Promise<Stats> {
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const qy = query(collection(db, "users", scope, "checkins"), where("habitId", "==", habitId));
  const snap = await getDocs(qy);
  const checks = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));

  const completedTotal = checks.length;
  let completedThisMonth = 0;
  let durationThisMonth = 0;
  if (month && month.length === 7) {
    for (const c of checks) {
      if (c.localDate.startsWith(month)) {
        completedThisMonth++;
        durationThisMonth += c.durationMinutes ?? 0;
      }
    }
  }

  let longest = 0, current = 0; let prev: string | null = null;
  for (const c of checks) {
    if (prev === null) current = 1;
    else {
      const prevDays = isoToEpochDays(prev);
      const curDays = isoToEpochDays(c.localDate);
      if (curDays === prevDays) continue;
      else if (curDays === prevDays + 1) current++;
      else current = 1;
    }
    longest = Math.max(longest, current);
    prev = c.localDate;
  }

  const totalDurationMinutes = checks.reduce((sum, c) => sum + (c.durationMinutes ?? 0), 0);
  const todayIso = todayInTZISO(tz);
  const todayRec = checks.find((c) => c.localDate === todayIso);
  const hasTodayCheckIn = !!todayRec;
  const todayDurationMinutes = todayRec?.durationMinutes ?? null;

  return { completedThisMonth, completedTotal, longestStreak: longest, totalDurationMinutes, durationThisMonth, hasTodayCheckIn, todayDurationMinutes };
}

// ---------- Series (for charts) ----------
export async function getRecentSeries(
  habitId: number,
  days: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const qy = query(collection(db, "users", scope, "checkins"), where("habitId", "==", habitId));
  const snap = await getDocs(qy);
  const sorted = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0))
    .map((c) => ({ date: c.localDate, minutes: c.durationMinutes ?? 0 }));

  const latest = sorted.length > 0 ? sorted[sorted.length - 1].date : todayInTZISO(tz);
  const start = addDaysISO(latest, -(days - 1));

  const map = new Map<string, number>();
  for (const p of sorted) map.set(p.date, p.minutes ?? 0);

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
  await authReady;
  const { db } = getFirebase();
  const scope = getScopeId();
  const qy = query(collection(db, "users", scope, "checkins"), where("habitId", "==", habitId));
  const snap = await getDocs(qy);
  const all = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0))
    .map((c) => ({ date: c.localDate, minutes: c.durationMinutes ?? 0 }));
  const latest = all.length > 0 ? all[all.length - 1].date : todayInTZISO(tz);
  const y = Number(latest.slice(0, 4));
  const m = Number(latest.slice(5, 7));
  const monthKey = latest.slice(0, 7);
  const start = `${monthKey}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();

  const map = new Map<string, number>();
  for (const c of all) if (c.date.startsWith(monthKey)) map.set(c.date, c.minutes ?? 0);

  const result: { date: string; minutes: number }[] = [];
  // Only include days that have "arrived". If this month is the current month (in tz),
  // cut off at today; otherwise include full month.
  const today = todayInTZISO(tz);
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
  await authReady;
  void tz; // keep signature stable; tz not used here
  const { db } = getFirebase();
  const scope = getScopeId();
  const qy = query(collection(db, "users", scope, "checkins"), where("habitId", "==", habitId));
  const snap = await getDocs(qy);
  const checks = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0))
    .map((c) => ({ date: c.localDate, minutes: c.durationMinutes ?? 0 }));

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
