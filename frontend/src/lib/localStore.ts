// store the data in browser localStorage for now
// will migrate to server AWS cloud or Google cloud later
const NS = "habittracker:v1"; // namespace for the localStorage

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
  localDate: string;          // yyyy-MM-dd
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

type DB = {
  version: 1;
  nextHabitId: number;
  nextCheckInId: number;
  habits: Habit[];
  checkins: CheckIn[];
};

function loadDB(): DB {
  const raw = localStorage.getItem(NS);
  if (!raw) {
    const empty: DB = {
      version: 1,
      nextHabitId: 1,
      nextCheckInId: 1,
      habits: [],
      checkins: []
    };
    localStorage.setItem(NS, JSON.stringify(empty));
    return empty;
  }
  try {
    return JSON.parse(raw) as DB;
  } 
  catch {
    const reset: DB = {
      version: 1,
      nextHabitId: 1,
      nextCheckInId: 1,
      habits: [],
      checkins: []
    };
    localStorage.setItem(NS, JSON.stringify(reset));
    return reset;
  }
}

function saveDB(db: DB) {
  localStorage.setItem(NS, JSON.stringify(db));
}

// ---------- date helper functions ----------
function todayInTZISO(tz?: string): string {
  const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;

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
  const db = loadDB();
  const list = includeArchived ? db.habits : db.habits.filter(h => !h.isArchived);

  return list.sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || a.id - b.id);
}

export async function createHabit(payload: {
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
}): Promise<Habit> {
  if (!payload.name?.trim()) throw new Error("Name is required.");
  
  const db = loadDB();
  const habit: Habit = {
    id: db.nextHabitId++,
    name: payload.name.trim(),
    description: payload.description ?? null,
    colorHex: payload.colorHex ?? null,
    iconKey: payload.iconKey ?? null,
    isArchived: false,
    createdUtc: new Date().toISOString()
  };

  db.habits.push(habit);
  saveDB(db);

  return habit;
}

export async function updateHabit(id: number, payload: {
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
  isArchived: boolean;
}): Promise<Habit> {
  const db = loadDB();
  const h = db.habits.find(x => x.id === id);

  if (!h) throw new Error("Habit not found.");
  if (!payload.name?.trim()) throw new Error("Name is required.");
  
  h.name = payload.name.trim();
  h.description = payload.description ?? null;
  h.colorHex = payload.colorHex ?? null;
  h.iconKey = payload.iconKey ?? null;
  h.isArchived = !!payload.isArchived;
  saveDB(db);

  return h;
}

// ---------- Check-in ----------
export async function upsertCheckIn(
  habitId: number,
  body: { localDate: string; durationMinutes?: number | null; userTimeZoneIana?: string }
): Promise<CheckIn> {
  const db = loadDB();
  const habit = db.habits.find(h => h.id === habitId);
  if (!habit) throw new Error("Habit not found.");

  const tz = body.userTimeZoneIana || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTZISO(tz);
  const min = addDaysISO(today, -7);

  if (body.localDate < min || body.localDate > today) {
    throw new Error(`Only the last 7 days (including today ${today}) are allowed.`);
  }

  const existing = db.checkins.find(c => c.habitId === habitId && c.localDate === body.localDate);
  if (existing) {
    existing.durationMinutes = body.durationMinutes ?? null;
    saveDB(db);
    return existing;
  }

  const check: CheckIn = {
    id: db.nextCheckInId++,
    habitId,
    localDate: body.localDate,
    durationMinutes: body.durationMinutes ?? null,
    createdUtc: new Date().toISOString()
  };
  db.checkins.push(check);
  saveDB(db);
  return check;
}

export async function deleteCheckIn(habitId: number, localDate: string): Promise<void> {
  const db = loadDB();
  const idx = db.checkins.findIndex(c => c.habitId === habitId && c.localDate === localDate);
  
  if (idx >= 0) {
    db.checkins.splice(idx, 1);
    saveDB(db);
  } 
  else {
    throw new Error("No check-in on that date.");
  }
}

// ---------- Stats ----------
export async function getStats(habitId: number, month?: string, tz?: string): Promise<Stats> {
  const db = loadDB();
  const checks = db.checkins
    .filter(c => c.habitId === habitId)
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

  let longest = 0, current = 0;
  let prev: string | null = null;
  for (const c of checks) {
    if (prev === null) {
      current = 1;
    } else {
      const prevDays = isoToEpochDays(prev);
      const curDays = isoToEpochDays(c.localDate);
      if (curDays === prevDays) {
        continue;
      } 
      else if (curDays === prevDays + 1) {
        current++;
      } 
      else {
        current = 1;
      }
    }
    longest = Math.max(longest, current);
    prev = c.localDate;
  }

  const totalDurationMinutes = checks.reduce((sum, c) => sum + (c.durationMinutes ?? 0), 0);

  const today = todayInTZISO(tz);
  const todayRec = checks.find(c => c.localDate === today);
  const hasTodayCheckIn = !!todayRec;
  const todayDurationMinutes = todayRec?.durationMinutes ?? null;

  return {
    completedThisMonth,
    completedTotal,
    longestStreak: longest,
    totalDurationMinutes,
    durationThisMonth,
    hasTodayCheckIn,
    todayDurationMinutes
  };
}

// ---------- Series (for charts) ----------
export async function getRecentSeries(
  habitId: number,
  days: number,
  tz?: string
): Promise<{ date: string; minutes: number }[]> {
  const db = loadDB();
  const checks = db.checkins
    .filter((c) => c.habitId === habitId)
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
  tz?: string
): Promise<{ date: string; minutes: number }[]> {
  const db = loadDB();
  const checks = db.checkins
    .filter((c) => c.habitId === habitId)
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
  tz?: string
): Promise<{ date: string; minutes: number }[]> {
  void tz; // intentionally read to keep API compatibility
  const db = loadDB();
  const checks = db.checkins
    .filter((c) => c.habitId === habitId)
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

// ---------- export/import for backup (future use) ----------
export function exportJson(): string {
  return localStorage.getItem(NS) ?? "";
}

export function importJson(json: string) {
  localStorage.setItem(NS, json);
}
