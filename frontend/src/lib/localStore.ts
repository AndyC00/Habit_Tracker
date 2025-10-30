// Firebase-backed store (no auth for now).
// Data is partitioned per device via a local clientId.
import { getFirebase, getClientId } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const NS = "habittracker:v1"; // reserved for local backup/export

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
function habitsColPath(clientId: string) {
  return ["users", clientId, "habits"] as const;
}
function checkinsColPath(clientId: string) {
  return ["users", clientId, "checkins"] as const;
}

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
  const { db } = getFirebase();
  const clientId = getClientId();
  const snap = await getDocs(collection(db, ...habitsColPath(clientId)));
  const all = snap.docs.map((d) => d.data() as Habit);
  const list = includeArchived ? all : all.filter((h) => !h.isArchived);
  return list.sort(
    (a, b) => Number(a.isArchived) - Number(b.isArchived) || a.id - b.id,
  );
}

export async function createHabit(payload: {
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
}): Promise<Habit> {
  if (!payload.name?.trim()) throw new Error("Name is required.");

  const existing = await listHabits(true);
  const nextId = existing.length
    ? Math.max(...existing.map((h) => h.id)) + 1
    : 1;

  const habit: Habit = {
    id: nextId,
    name: payload.name.trim(),
    description: payload.description ?? null,
    colorHex: payload.colorHex ?? null,
    iconKey: payload.iconKey ?? null,
    isArchived: false,
    createdUtc: new Date().toISOString(),
  };

  const { db } = getFirebase();
  const clientId = getClientId();
  await setDoc(doc(db, ...habitsColPath(clientId), String(habit.id)), habit);
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
  const { db } = getFirebase();
  const clientId = getClientId();
  const ref = doc(db, ...habitsColPath(clientId), String(id));
  const snap = await getDoc(ref);
  const h = snap.exists() ? (snap.data() as Habit) : null;
  if (!h) throw new Error("Habit not found.");
  if (!payload.name?.trim()) throw new Error("Name is required.");

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
  const { db } = getFirebase();
  const clientId = getClientId();

  // ensure habit exists
  const habitSnap = await getDoc(doc(db, ...habitsColPath(clientId), String(habitId)));
  if (!habitSnap.exists()) throw new Error("Habit not found.");

  const tz = body.userTimeZoneIana || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTZISO(tz);
  const min = addDaysISO(today, -7);

  if (body.localDate < min || body.localDate > today) {
    throw new Error(`Only the last 7 days (including today ${today}) are allowed.`);
  }

  const checkId = `${habitId}_${body.localDate}`;
  const ref = doc(db, ...checkinsColPath(clientId), checkId);
  const snap = await getDoc(ref);
  const base: CheckIn = snap.exists()
    ? (snap.data() as CheckIn)
    : {
        // deterministic numeric id for compatibility
        id: parseInt(`${habitId}${body.localDate.replace(/-/g, "")}`, 10),
        habitId,
        localDate: body.localDate,
        durationMinutes: null,
        createdUtc: new Date().toISOString(),
      };
  const updated: CheckIn = {
    ...base,
    durationMinutes: body.durationMinutes ?? null,
  };
  await setDoc(ref, updated);
  return updated;
}

export async function deleteCheckIn(habitId: number, localDate: string): Promise<void> {
  const { db } = getFirebase();
  const clientId = getClientId();
  const ref = doc(db, ...checkinsColPath(clientId), `${habitId}_${localDate}`);
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
  const { db } = getFirebase();
  const clientId = getClientId();
  const q = query(
    collection(db, ...checkinsColPath(clientId)),
    where("habitId", "==", habitId),
  );
  const snap = await getDocs(q);
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

  let longest = 0,
    current = 0;
  let prev: string | null = null;
  for (const c of checks) {
    if (prev === null) {
      current = 1;
    } else {
      const prevDays = isoToEpochDays(prev);
      const curDays = isoToEpochDays(c.localDate);
      if (curDays === prevDays) {
        continue;
      } else if (curDays === prevDays + 1) {
        current++;
      } else {
        current = 1;
      }
    }
    longest = Math.max(longest, current);
    prev = c.localDate;
  }

  const totalDurationMinutes = checks.reduce(
    (sum, c) => sum + (c.durationMinutes ?? 0),
    0,
  );

  const today = todayInTZISO(tz);
  const todayRec = checks.find((c) => c.localDate === today);
  const hasTodayCheckIn = !!todayRec;
  const todayDurationMinutes = todayRec?.durationMinutes ?? null;

  return {
    completedThisMonth,
    completedTotal,
    longestStreak: longest,
    totalDurationMinutes,
    durationThisMonth,
    hasTodayCheckIn,
    todayDurationMinutes,
  };
}

// ---------- Series (for charts) ----------
export async function getRecentSeries(
  habitId: number,
  days: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  const { db } = getFirebase();
  const clientId = getClientId();
  const q = query(
    collection(db, ...checkinsColPath(clientId)),
    where("habitId", "==", habitId),
  );
  const snap = await getDocs(q);
  const checks = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));

  const latest = checks.length > 0 ? checks[checks.length - 1].localDate : todayInTZISO(tz);
  const start = addDaysISO(latest, -(days - 1));

  const map = new Map<string, number | null>();
  for (const c of checks) {
    map.set(c.localDate, c.durationMinutes ?? 0);
  }

  const points: { date: string; minutes: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i);
    const v = map.get(d);
    points.push({ date: d, minutes: v == null ? 0 : v });
  }

  return points; // oldest -> newest
}

export async function getMonthSeries(
  habitId: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  const { db } = getFirebase();
  const clientId = getClientId();
  const q = query(
    collection(db, ...checkinsColPath(clientId)),
    where("habitId", "==", habitId),
  );
  const snap = await getDocs(q);
  const checks = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));

  const latest = checks.length > 0 ? checks[checks.length - 1].localDate : todayInTZISO(tz);
  const y = Number(latest.slice(0, 4));
  const m = Number(latest.slice(5, 7));
  const monthKey = latest.slice(0, 7);
  const start = `${monthKey}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();

  const map = new Map<string, number | null>();
  for (const c of checks) {
    if (c.localDate.startsWith(monthKey)) {
      map.set(c.localDate, c.durationMinutes ?? 0);
    }
  }

  const points: { date: string; minutes: number }[] = [];
  // Only include days that have "arrived". If this month is the current month (in tz),
  // cut off at today; otherwise include full month.
  const today = todayInTZISO(tz);
  const isCurrentMonth = today.slice(0, 7) === monthKey;
  const endDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth;
  for (let i = 0; i < endDay; i++) {
    const d = addDaysISO(start, i);
    const v = map.get(d);
    points.push({ date: d, minutes: v == null ? 0 : v });
  }

  return points; // oldest -> newest within month
}

export async function getTotalSeries(
  habitId: number,
  tz?: string,
): Promise<{ date: string; minutes: number }[]> {
  void tz; // intentionally read to keep API compatibility
  const { db } = getFirebase();
  const clientId = getClientId();
  const q = query(
    collection(db, ...checkinsColPath(clientId)),
    where("habitId", "==", habitId),
  );
  const snap = await getDocs(q);
  const checks = snap.docs
    .map((d) => d.data() as CheckIn)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));

  if (checks.length === 0) return [];

  const start = checks[0].localDate;
  const end = checks[checks.length - 1].localDate;
  const days = isoToEpochDays(end) - isoToEpochDays(start) + 1;

  const map = new Map<string, number | null>();
  for (const c of checks) {
    map.set(c.localDate, c.durationMinutes ?? 0);
  }

  const points: { date: string; minutes: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i);
    const v = map.get(d);
    points.push({ date: d, minutes: v == null ? 0 : v });
  }

  return points; // oldest -> newest over full range
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
  const raw = localStorage.getItem(NS);
  if (!raw) return { habits: 0, checkins: 0 };
  try {
    const parsed = JSON.parse(raw) as {
      habits?: Habit[];
      checkins?: CheckIn[];
    };
    const { db } = getFirebase();
    const clientId = getClientId();
    let h = 0, c = 0;
    for (const it of parsed.habits || []) {
      await setDoc(doc(db, ...habitsColPath(clientId), String(it.id)), it, { merge: true });
      h++;
    }
    for (const it of parsed.checkins || []) {
      const cid = `${it.habitId}_${it.localDate}`;
      await setDoc(doc(db, ...checkinsColPath(clientId), cid), it, { merge: true });
      c++;
    }
    return { habits: h, checkins: c };
  } catch {
    return { habits: 0, checkins: 0 };
  }
}
