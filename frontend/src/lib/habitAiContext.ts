import type { Habit, HabitCheckInHistoryEntry, Stats } from "./localStore";

export function buildHabitContext(
  habit: Habit,
  stats?: Stats,
  todayMinutes?: number | "" | undefined,
) {
  const lines = [
    `Name: ${habit.name}`,
    habit.description ? `Description: ${habit.description}` : null,
    habit.isArchived ? "Archived: yes" : "Archived: no",
    stats ? `Completed total: ${stats.completedTotal}` : null,
    stats ? `Longest streak: ${stats.longestStreak}` : null,
    stats ? `Total minutes: ${stats.totalDurationMinutes}` : null,
    stats ? `Minutes this month: ${stats.durationThisMonth}` : null,
    typeof todayMinutes === "number" ? `Today minutes: ${todayMinutes}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

type BuildHabitAnalysisContextOptions = {
  ambientContext: string;
  habit: Habit;
  stats: Stats;
  history: HabitCheckInHistoryEntry[];
  validHistoryCount: number;
};

export function buildHabitAnalysisContext({
  ambientContext,
  habit,
  stats,
  history,
  validHistoryCount,
}: BuildHabitAnalysisContextOptions) {
  const habitLines = [
    `Name: ${habit.name}`,
    habit.description ? `Description: ${habit.description}` : null,
    habit.createdUtc ? `Created: ${habit.createdUtc}` : null,
    `Archived: ${habit.isArchived ? "yes" : "no"}`,
    `Completed this month: ${stats.completedThisMonth}`,
    `Completed total: ${stats.completedTotal}`,
    `Longest streak: ${stats.longestStreak}`,
    `Total minutes: ${stats.totalDurationMinutes}`,
    `Minutes this month: ${stats.durationThisMonth}`,
    `Completed today: ${stats.hasTodayCheckIn ? "yes" : "no"}`,
    typeof stats.todayDurationMinutes === "number"
      ? `Today minutes: ${stats.todayDurationMinutes}`
      : null,
  ].filter(Boolean);

  const sections = [ambientContext.trim(), `Habit information:\n${habitLines.join("\n")}`];
  if (history.length > 0) {
    const historyLabel =
      validHistoryCount > history.length
        ? `Check-in history (latest ${history.length} of ${validHistoryCount} valid records):`
        : `Check-in history (${validHistoryCount} valid records):`;
    const historyLines = history.map(
      (entry) => `${entry.localDate}: ${entry.durationMinutes} minutes`,
    );
    sections.push(`${historyLabel}\n${historyLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export function buildHabitAnalysisSourceSignature(habit: Habit, stats: Stats) {
  return JSON.stringify({
    habit: {
      id: habit.id,
      name: habit.name,
      description: habit.description ?? null,
      createdUtc: habit.createdUtc ?? null,
      isArchived: habit.isArchived,
    },
    stats: {
      completedThisMonth: stats.completedThisMonth,
      completedTotal: stats.completedTotal,
      longestStreak: stats.longestStreak,
      totalDurationMinutes: stats.totalDurationMinutes,
      durationThisMonth: stats.durationThisMonth,
      hasTodayCheckIn: stats.hasTodayCheckIn,
      todayDurationMinutes: stats.todayDurationMinutes,
    },
  });
}
