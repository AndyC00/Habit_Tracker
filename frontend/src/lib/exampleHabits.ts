import type { Habit, Stats } from "./localStore";

const weekMinutes = [20, 0, 30, 25, 10, 0, 35];

function isoFromToday(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toEpochDays(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
}

function computeLongestStreak(points: { date: string; minutes: number }[]): number {
  let longest = 0;
  let current = 0;
  let prevDay: number | null = null;

  for (const p of points) {
    if (p.minutes <= 0) {
      current = 0;
      prevDay = null;
      continue;
    }
    const day = toEpochDays(p.date);
    if (prevDay !== null && day === prevDay + 1) current += 1;
    else current = 1;
    prevDay = day;
    longest = Math.max(longest, current);
  }
  return longest;
}

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
const dayOfMonth = now.getDate();

const weekSeries = weekMinutes.map((minutes, idx) => ({
  date: isoFromToday(idx - 6),
  minutes,
}));

const basePattern = [12, 0, 18, 0, 22, 16, 0, 24];
const monthMinutes: number[] = [];
if (dayOfMonth <= 7) {
  const start = 7 - dayOfMonth;
  monthMinutes.push(...weekMinutes.slice(start));
} else {
  const extraDays = dayOfMonth - 7;
  for (let i = 0; i < extraDays; i++) {
    monthMinutes.push(basePattern[i % basePattern.length]);
  }
  monthMinutes.push(...weekMinutes);
}

const monthSeries = monthMinutes.map((minutes, idx) => ({
  date: `${currentYear}-${currentMonth}-${String(idx + 1).padStart(2, "0")}`,
  minutes,
}));

const completedThisMonth = monthMinutes.filter((m) => m > 0).length;
const durationThisMonth = monthMinutes.reduce((sum, m) => sum + Math.max(0, m), 0);
const longestStreak = computeLongestStreak(monthSeries);
const todayMinutes = weekMinutes[weekMinutes.length - 1];
const hasTodayCheckIn = todayMinutes > 0;

const completedTotal = completedThisMonth + 42;
const totalDurationMinutes = durationThisMonth + 420;

const monthlyTotalsTemplate = [320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540];
const monthIndex = now.getMonth();
const monthlyTotals = monthlyTotalsTemplate.map((val, idx) => (idx === monthIndex ? durationThisMonth : val));
const exampleTotalSeries: { date: string; minutes: number }[] = [];
let acc = 0;
for (let i = 0; i < 12; i++) {
  acc += monthlyTotals[i];
  const month = String(i + 1).padStart(2, "0");
  exampleTotalSeries.push({ date: `${currentYear}-${month}-01`, minutes: acc });
}

export const EXAMPLE_HABIT_ID = 9999;

export const EXAMPLE_HABIT: Habit = {
  id: EXAMPLE_HABIT_ID,
  name: "Stay Hydrated",
  description: "Track daily water intake to build a consistent hydration habit.",
  colorHex: "#0d5475ff",
  iconKey: "water",
  isArchived: false,
  createdUtc: new Date().toISOString(),
  isExample: true,
};

export const EXAMPLE_STATS_BY_ID: Record<number, Stats> = {
  [EXAMPLE_HABIT_ID]: {
    completedThisMonth,
    completedTotal,
    longestStreak,
    totalDurationMinutes,
    durationThisMonth,
    hasTodayCheckIn,
    todayDurationMinutes: hasTodayCheckIn ? todayMinutes : null,
  },
};

export const EXAMPLE_DURATION_BY_ID: Record<number, number | "" | undefined> = {
  [EXAMPLE_HABIT_ID]: hasTodayCheckIn ? todayMinutes : "",
};

export const EXAMPLE_WEEK_SERIES = weekSeries;
export const EXAMPLE_MONTH_SERIES = monthSeries;
export const EXAMPLE_TOTAL_SERIES_BY_YEAR: Record<number, { date: string; minutes: number }[]> = {
  [currentYear]: exampleTotalSeries,
};
export const EXAMPLE_TOTAL_YEARS = [currentYear];

export function getExampleHabitsData(): {
  habits: Habit[];
  statsById: Record<number, Stats>;
  durationById: Record<number, number | "" | undefined>;
  isExample: true;
} {
  return {
    habits: [EXAMPLE_HABIT],
    statsById: EXAMPLE_STATS_BY_ID,
    durationById: EXAMPLE_DURATION_BY_ID,
    isExample: true as const,
  };
}
