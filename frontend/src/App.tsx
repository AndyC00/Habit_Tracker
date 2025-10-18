import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Dumbbell, BookOpen, Droplet, Moon, Code, Music, Coffee, Target, Timer, Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import * as store from "./lib/localStore";  // future use import { http } from "./lib/http"; when changed to cloud


// ------------------ constants and types ------------------
type Habit = {
  id: number;
  name: string;
  description?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
  isArchived: boolean;
};

type HabitFormValues = {
  name: string;
  description: string;
  colorHex: string;
  iconKey: string;
  isArchived: boolean;
};

type Stats = {
  completedThisMonth: number;
  completedTotal: number;
  longestStreak: number;
  totalDurationMinutes: number;
  durationThisMonth: number;
  hasTodayCheckIn: boolean;
  todayDurationMinutes: number | null;
};

const ICONS = {
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

type IconKey = keyof typeof ICONS;
const DEFAULT_ICON: LucideIcon = Circle;

// ------------------ helper functions ------------------
// async function http<T>(path: string, init?: RequestInit): Promise<T> {
//   const raw = import.meta.env.VITE_API_BASE as string;
//   if (!raw) throw new Error("VITE_API_BASE in .env is not set");
//   const base = raw.replace(/\/+$/, "");

//   const res = await fetch(`${base}${path}`, {
//     headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
//     ...init,
//   });

//   if (!res.ok) throw new Error(await res.text());

//   if (res.status === 204) return undefined as T;

//   return res.json();
// }

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// const ianaTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// const monthOf = (isoDate: string) => isoDate.slice(0, 7);

function getIconByKey(key?: string | null): LucideIcon {
  if (!key) return DEFAULT_ICON;
  return (ICONS as Record<string, LucideIcon>)[key] ?? DEFAULT_ICON;
}

const ICON_OPTIONS: { key: IconKey; label: string }[] = [
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

// ------------------ main component ------------------
export default function App() {
  // --- inner state & constants ---
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statsById, setStatsById] = useState<Record<number, Stats | undefined>>({});
  const [durationById, setDurationById] = useState<Record<number, number | "" | undefined>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);

  const defaultFormValues: HabitFormValues = {
    name: "",
    description: "",
    colorHex: "",
    iconKey: "",
    isArchived: false,
  };

  const [formMode, setFormMode] = useState<
    | null
    | { type: "create" }
    | { type: "edit"; habitId: number }
  >(null);

  const [formValues, setFormValues] = useState<HabitFormValues>(defaultFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [formPending, setFormPending] = useState(false);

  // --- inner functions ---
  async function load() {
    try {
      setLoading(true);
      const list = await store.listHabits(false);
      setHabits(list);

      const today = todayLocalISO();
      const mo = today.slice(0, 7);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const entries = await Promise.all(
        list.map(async (h) => {
          const s = await store.getStats(h.id, mo, tz);
          return [h.id, s] as const;
        })
      );

      const statsMap: Record<number, Stats> = {};
      const durMap: Record<number, number | "" | undefined> = {};
      for (const [id, s] of entries) {
        statsMap[id] = s;
        durMap[id] = s.todayDurationMinutes ?? "";
      }
      setStatsById(statsMap);
      setDurationById(durMap);
    }
    catch (e: any) {
      setError(e.message ?? "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    load();
  }, []);

  async function checkIn(habitId: number) {
    setPendingId(habitId);
    try {
      const value = durationById[habitId];
      await store.upsertCheckIn(habitId, {
        localDate: todayLocalISO(),
        durationMinutes: value === "" || value === undefined ? null : Number(value),
        userTimeZoneIana: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      await refreshStatsFor(habitId);
    } catch (e: any) {
      alert(e.message ?? "Failed to check-in");
    } finally {
      setPendingId(null);
    }
  }

  async function undoToday(habitId: number) {
    setPendingId(habitId);
    try {
      await store.deleteCheckIn(habitId, todayLocalISO());
      await refreshStatsFor(habitId);
    } catch (e: any) {
      alert(e.message ?? "Failed to undo");
    } finally {
      setPendingId(null);
    }
  }

  async function refreshStatsFor(habitId: number) {
    const mo = todayLocalISO().slice(0, 7);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const s = await store.getStats(habitId, mo, tz);

    setStatsById((prev) => ({ ...prev, [habitId]: s }));
    setDurationById((prev) => ({ ...prev, [habitId]: s.todayDurationMinutes ?? "" }));
  }

  // --- form functions ---
  function openCreateForm() {
    setFormValues(defaultFormValues);
    setFormMode({ type: "create" });
    setFormError(null);
  }

  function openEditForm(habit: Habit) {
    setFormValues({
      name: habit.name,
      description: habit.description ?? "",
      colorHex: habit.colorHex ?? "",
      iconKey: habit.iconKey ?? "",
      isArchived: habit.isArchived,
    });
    setFormMode({ type: "edit", habitId: habit.id });
    setFormError(null);
  }

  function closeForm() {
    setFormMode(null);
    setFormError(null);
    setFormValues(defaultFormValues);
    setFormPending(false);
  }

  function normalizeOptional(value: string) {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formMode) return;

    if (!formValues.name.trim()) {
      setFormError("Name is required.");
      return;
    }

    setFormPending(true);
    setFormError(null);
    try {
      const payload = {
        name: formValues.name.trim(),
        description: normalizeOptional(formValues.description),
        colorHex: normalizeOptional(formValues.colorHex),
        iconKey: normalizeOptional(formValues.iconKey),
      };

      if (formMode.type === "create") {
        await store.createHabit(payload);
      } else {
        await store.updateHabit(formMode.habitId, { ...payload, isArchived: formValues.isArchived });
      }
      await load();
      closeForm();
    }
    catch (e: any) {
      setFormError(e.message ?? "Failed to save habit.");
    }
    finally {
      setFormPending(false);
    }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  // --- output ---
  return (
    <div className="container">
      <h1>Habit Tracker</h1>

      <div className="actions">
        <button className="btn primary" onClick={openCreateForm}>
          New Habit
        </button>
      </div>

      <ul className="habits">
        {habits.map((h) => {
          const stats = statsById[h.id];
          const dur = durationById[h.id] ?? "";
          const bg = h.colorHex ?? "#1e1e1e";

          return (
            <li key={h.id} className="habit-item" style={{ ["--bg" as any]: bg }}>
              <div className="habit-info">
                <div className="habit-title">
                  {(() => {
                    const Icon = getIconByKey(h.iconKey);
                    return <Icon className="habit-icon" size={18} />;
                  })()}
                  {h.name}
                  {h.isArchived && <span className="habit-archived">Archived</span>}
                </div>
                {h.description && <div className="habit-desc">{h.description}</div>}

                <div className="habit-stats">
                  <p>Completed (total): {stats?.completedTotal ?? 0} days</p>
                  <p>Longest streak: {stats?.longestStreak ?? 0}</p>
                  <p>Total minutes: {stats?.totalDurationMinutes ?? 0}</p>
                  <p>This month minutes: {stats?.durationThisMonth ?? 0}</p>
                </div>
              </div>

              <div className="habit-actions">
                <div className="row">
                  <label style={{ marginRight: 8 }}>Today minutes</label>
                  <input
                    type="number"
                    min={0}
                    value={dur}
                    onChange={(e) =>
                      setDurationById((prev) => ({
                        ...prev,
                        [h.id]: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    style={{ width: 120, marginRight: 8 }}
                    placeholder="optional"
                  />
                  <button
                    className="btn"
                    disabled={pendingId === h.id}
                    onClick={() => checkIn(h.id)}
                    title={stats?.hasTodayCheckIn ? "Update today's minutes" : "Check-in today"}
                  >
                    {pendingId === h.id
                      ? "Saving…"
                      : stats?.hasTodayCheckIn
                        ? "Update Today"
                        : "Check-in Today"}
                  </button>

                  <button
                    className="btn"
                    disabled={pendingId === h.id || !stats?.hasTodayCheckIn}
                    onClick={() => undoToday(h.id)}
                    style={{ marginLeft: 8 }}
                  >
                    Undo Today
                  </button>
                  <button
                    className="btn"
                    onClick={() => openEditForm(h)}
                    style={{ marginLeft: 8 }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {formMode && (
        <div className="habit-form-backdrop" role="presentation">
          <form className="habit-form" onSubmit={submitForm}>
            <h2>{formMode.type === "create" ? "Create Habit" : "Edit Habit"}</h2>

            <label>
              Name
              <input
                type="text"
                value={formValues.name}
                onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                required
              />
            </label>

            <label>
              Description
              <textarea
                value={formValues.description}
                onChange={(e) =>
                  setFormValues({ ...formValues, description: e.target.value })
                }
                placeholder="Optional description"
              />
            </label>

            <label>
              Color Hex
              <input
                type="text"
                value={formValues.colorHex}
                onChange={(e) =>
                  setFormValues({ ...formValues, colorHex: e.target.value })
                }
                placeholder="#RRGGBB"
              />
            </label>

            <label>
              Icon
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={formValues.iconKey}
                  onChange={(e) =>
                    setFormValues({ ...formValues, iconKey: e.target.value })
                  }
                >
                  <option value="">(None)</option>
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span title={formValues.iconKey || "default"}>
                  {(() => {
                    const Preview = getIconByKey(formValues.iconKey);
                    return <Preview size={18} />;
                  })()}
                </span>
              </div>
            </label>

            {formMode.type === "edit" && (
              <label className="habit-form-checkbox">
                <input
                  type="checkbox"
                  checked={formValues.isArchived}
                  onChange={(e) =>
                    setFormValues({ ...formValues, isArchived: e.target.checked })
                  }
                />
                <span>Mark as archived</span>
              </label>
            )}

            {formError && <div className="habit-form-error">{formError}</div>}

            <div className="habit-form-actions">
              <button
                type="button"
                className="btn"
                onClick={closeForm}
                disabled={formPending}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={formPending}>
                {formPending
                  ? "Saving…"
                  : formMode.type === "create"
                    ? "Create Habit"
                    : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
