import {
  BookOpen,
  Circle,
  Code,
  Coffee,
  Dumbbell,
  Droplet,
  Moon,
  Music,
  Target,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ICONS = {
  gym: Dumbbell,
  read: BookOpen,
  water: Droplet,
  sleep: Moon,
  code: Code,
  music: Music,
  coffee: Coffee,
  focus: Target,
  pomodoro: Timer,
} as const;

export type IconKey = keyof typeof ICONS;

export const DEFAULT_ICON: LucideIcon = Circle;

export function getIconByKey(key?: string | null): LucideIcon {
  if (!key) return DEFAULT_ICON;
  return (ICONS as Record<string, LucideIcon>)[key] ?? DEFAULT_ICON;
}

export const ICON_OPTIONS: { key: IconKey; label: string }[] = [
  { key: "gym", label: "Gym / Workout" },
  { key: "read", label: "Read" },
  { key: "water", label: "Drink Water" },
  { key: "sleep", label: "Sleep" },
  { key: "code", label: "Code" },
  { key: "music", label: "Music" },
  { key: "coffee", label: "Coffee" },
  { key: "focus", label: "Focus" },
  { key: "pomodoro", label: "Pomodoro" },
];
