import type { Habit, Stats } from "../localStore";
import * as store from "../localStore";

type WithStatsMaps = {
  habits: Habit[];
  statsById: Record<number, Stats>;
  durationById: Record<number, number | "" | undefined>;
};

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

function monthKeyFromToday(tz?: string) {
  return todayInTZISO(tz).slice(0, 7);
}

async function buildStatsMap(habits: Habit[], tz?: string): Promise<WithStatsMaps> {
  const monthKey = monthKeyFromToday(tz);
  const entries = await Promise.all(
    habits.map(async (h) => {
      const s = await store.getStats(h.id, monthKey, tz);
      return [h.id, s] as const;
    })
  );

  const statsById: Record<number, Stats> = {};
  const durationById: Record<number, number | "" | undefined> = {};
  for (const [id, stats] of entries) {
    statsById[id] = stats;
    durationById[id] = stats.todayDurationMinutes ?? "";
  }
  return { habits, statsById, durationById };
}

export async function loadActiveHabitsWithStats(tz?: string): Promise<WithStatsMaps> {
  const habits = await store.listHabits(false);
  return buildStatsMap(habits, tz);
}

export async function loadArchivedHabitsWithStats(tz?: string): Promise<WithStatsMaps> {
  const all = await store.listHabits(true);
  const archived = all.filter((h) => h.isArchived);
  return buildStatsMap(archived, tz);
}

export async function getStatsForHabit(habitId: number, tz?: string): Promise<{
  stats: Stats;
  todayDuration: number | "" | undefined;
}> {
  const monthKey = monthKeyFromToday(tz);
  const stats = await store.getStats(habitId, monthKey, tz);
  return {
    stats,
    todayDuration: stats.todayDurationMinutes ?? "",
  };
}
