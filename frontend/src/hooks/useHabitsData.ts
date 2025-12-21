import { useCallback, useEffect, useState } from "react";
import type { Habit, Stats } from "../lib/localStore";
import * as store from "../lib/localStore";
import { getStatsForHabit, loadActiveHabitsWithStats, loadArchivedHabitsWithStats } from "../lib/services/habitService";

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useHabitsData() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [statsById, setStatsById] = useState<Record<number, Stats | undefined>>({});
  const [archivedStatsById, setArchivedStatsById] = useState<Record<number, Stats | undefined>>({});
  const [durationById, setDurationById] = useState<Record<number, number | "" | undefined>>({});
  const [isExampleData, setIsExampleData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const loadHabits = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      setLoading(true);
      const { habits: list, statsById: statsMap, durationById: durMap, isExample } = await loadActiveHabitsWithStats(tz);
      setHabits(list);
      setStatsById(statsMap);
      setDurationById(durMap);
      setIsExampleData(isExample);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  const refreshStatsFor = useCallback(async (habitId: number) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { stats, todayDuration } = await getStatsForHabit(habitId, tz);

    setStatsById((prev) => ({ ...prev, [habitId]: stats }));
    setDurationById((prev) => ({ ...prev, [habitId]: todayDuration }));
  }, []);

  const checkIn = useCallback(
    async (habitId: number) => {
      if (isExampleData) return;
      setPendingId(habitId);
      try {
        const value = durationById[habitId];
        await store.upsertCheckIn(habitId, {
          localDate: todayLocalISO(),
          durationMinutes: value === "" || value === undefined ? null : Number(value),
          userTimeZoneIana: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        await refreshStatsFor(habitId);
      } catch (e: any) {
        alert(e.message ?? "Failed to check-in");
      } finally {
        setPendingId(null);
      }
    },
    [durationById, isExampleData, refreshStatsFor],
  );

  const undoToday = useCallback(
    async (habitId: number) => {
      if (isExampleData) return;
      setPendingId(habitId);
      try {
        await store.deleteCheckIn(habitId, todayLocalISO());
        await refreshStatsFor(habitId);
      } catch (e: any) {
        alert(e.message ?? "Failed to undo");
      } finally {
        setPendingId(null);
      }
    },
    [isExampleData, refreshStatsFor],
  );

  const loadArchived = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { habits: archived, statsById } = await loadArchivedHabitsWithStats(tz);
    setArchivedHabits(archived);
    setArchivedStatsById(statsById);
  }, []);

  return {
    habits,
    statsById,
    durationById,
    setDurationById,
    isExampleData,
    loading,
    error,
    pendingId,
    checkIn,
    undoToday,
    refreshStatsFor,
    loadHabits,
    archivedHabits,
    archivedStatsById,
    loadArchived,
  };
}
