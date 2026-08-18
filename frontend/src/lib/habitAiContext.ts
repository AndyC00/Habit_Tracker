import type { Habit, HabitCheckInHistoryEntry, Stats } from "./localStore";

export function buildHabitContext(
  habit: Habit,
  stats?: Stats,
  todayMinutes?: number | "" | undefined,
) {
  const lines = [
    `Name: ${habit.name}`,
    habit.description ? `Description: ${habit.description}` : null,
    habit.expectedPerformance
      ? `Expected performance: ${habit.expectedPerformance}`
      : null,
    stats?.startedOn ? `Started: ${stats.startedOn}` : "Started: not started",
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
  analysisDate: string;
  habit: Habit;
  stats: Stats;
  timeline: HabitAnalysisTimeline;
};

export type HabitAnalysisTimelineDay = {
  localDate: string;
  checkedIn: boolean;
  durationMinutes: number | null;
};

export type HabitAnalysisTimeline = {
  days: HabitAnalysisTimelineDay[];
  totalCalendarDays: number;
  totalCheckInDays: number;
  missedDays: number;
  truncated: boolean;
};

function isoToEpochDays(iso: string) {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
}

function addDaysISO(iso: string, delta: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function buildHabitAnalysisTimeline(
  history: HabitCheckInHistoryEntry[],
  startedOn: string,
  analysisDate: string,
  maxDays: number,
): HabitAnalysisTimeline {
  const totalCalendarDays =
    isoToEpochDays(analysisDate) - isoToEpochDays(startedOn) + 1;
  const truncated = totalCalendarDays > maxDays;
  const timelineStart = truncated
    ? addDaysISO(analysisDate, -(maxDays - 1))
    : startedOn;
  const recordsByDate = new Map(
    history.map((entry) => [entry.localDate, entry.durationMinutes]),
  );
  const days: HabitAnalysisTimelineDay[] = [];

  for (
    let localDate = timelineStart;
    localDate <= analysisDate;
    localDate = addDaysISO(localDate, 1)
  ) {
    const checkedIn = recordsByDate.has(localDate);
    days.push({
      localDate,
      checkedIn,
      durationMinutes: checkedIn ? recordsByDate.get(localDate)! : null,
    });
  }

  return {
    days,
    totalCalendarDays,
    totalCheckInDays: history.length,
    missedDays: totalCalendarDays - history.length,
    truncated,
  };
}

export function buildHabitAnalysisContext({
  ambientContext,
  analysisDate,
  habit,
  stats,
  timeline,
}: BuildHabitAnalysisContextOptions) {
  const adherenceRate = (
    (timeline.totalCheckInDays / timeline.totalCalendarDays) *
    100
  ).toFixed(1);
  const habitLines = [
    `Name: ${habit.name}`,
    habit.description ? `Description: ${habit.description}` : null,
    habit.expectedPerformance
      ? `Expected performance: ${habit.expectedPerformance}`
      : null,
    `Habit start date (first check-in): ${stats.startedOn}`,
    `Analysis date: ${analysisDate}`,
    `Archived: ${habit.isArchived ? "yes" : "no"}`,
    `Observed calendar days: ${timeline.totalCalendarDays}`,
    `Check-in days: ${timeline.totalCheckInDays}`,
    `Missed days since start: ${timeline.missedDays}`,
    `Check-in rate: ${adherenceRate}%`,
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
  const timelineLabel = timeline.truncated
    ? `Daily timeline (latest ${timeline.days.length} of ${timeline.totalCalendarDays} calendar days):`
    : `Daily timeline (${timeline.totalCalendarDays} calendar days):`;
  const timelineLines = timeline.days.map((day) => {
    if (!day.checkedIn) return `${day.localDate}: missed (no check-in)`;
    if (typeof day.durationMinutes === "number") {
      return `${day.localDate}: checked in, ${day.durationMinutes} minutes`;
    }
    return `${day.localDate}: checked in, duration not recorded`;
  });
  sections.push(`${timelineLabel}\n${timelineLines.join("\n")}`);

  return sections.join("\n\n");
}

export function buildHabitAnalysisSourceSignature(
  habit: Habit,
  stats: Stats,
  analysisDate: string,
) {
  return JSON.stringify({
    analysisDate,
    habit: {
      id: habit.id,
      name: habit.name,
      description: habit.description ?? null,
      expectedPerformance: habit.expectedPerformance ?? null,
      createdUtc: habit.createdUtc ?? null,
      isArchived: habit.isArchived,
    },
    stats: {
      startedOn: stats.startedOn,
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
