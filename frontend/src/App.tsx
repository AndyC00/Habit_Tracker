import { useEffect, useState } from "react";
import type { FormEvent } from "react";

// ------------------ constants and types ------------------
type Habit = {
  id: number;
  name: string;
  description?: string;
  colorHex?: string;
  iconKey?: string;
  isArchived: boolean;
};
type CheckIn = {
  id: number;
  habitId: number;
  localDate: string;
  durationMinutes?: number;
};

type HabitFormValues = {
  name: string;
  description: string;
  colorHex: string;
  iconKey: string;
  isArchived: boolean;
};

// ------------------ helper functions ------------------
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_API_BASE as string;
  if (!base) throw new Error("VITE_API_BASE in .env is not set");

  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ------------------ main component ------------------
export default function App() {
  // --- inner state & constants ---
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | "">("");
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
      setHabits(await http<Habit[]>("/api/habits?includeArchived=false"));
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function checkIn(habitId: number) {
    setPendingId(habitId);
    try {
      const body = {
        localDate: todayLocalISO(),
        durationMinutes: duration === "" ? null : Number(duration),
        userTimeZoneIana: Intl.DateTimeFormat().resolvedOptions().timeZone, // e.g. Pacific/Auckland
      };
      await http<CheckIn>(`/api/habits/${habitId}/checkins`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e: any) {
      alert(e.message ?? "Failed to check-in");
    } finally {
      setPendingId(null);
    }
  }

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
        await http<Habit>("/api/habits", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await http<Habit>(`/api/habits/${formMode.habitId}`, {
          method: "PUT",
          body: JSON.stringify({ ...payload, isArchived: formValues.isArchived }),
        });
      }

      await load();
      closeForm();
    } catch (e: any) {
      setFormError(e.message ?? "Failed to save habit.");
    } finally {
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

      <div className="duration">
        <label>Duration (minutes, optional): </label>
        <input
          type="number"
          min={0}
          value={duration}
          onChange={(e) =>
            setDuration(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
        <span className="today">today: {todayLocalISO()}</span>
      </div>

      <ul className="habits">
        {habits.map((h) => (
          <li
            key={h.id}
            className="habit-item"
            style={{ ["--bg" as any]: h.colorHex ?? "#1e1e1e" }}  // control bg color via CSS variable
          >
            <div className="habit-info">
              <div className="habit-title">
                {h.name}
                {h.isArchived && <span className="habit-archived">Archived</span>}
              </div>
              {h.description && <div className="habit-desc">{h.description}</div>}
            </div>
            <div className="habit-actions">
              <button className="btn" onClick={() => openEditForm(h)}>
                Edit
              </button>
              <button
                className="btn"
                disabled={pendingId === h.id}
                onClick={() => checkIn(h.id)}
              >
                {pendingId === h.id ? "Checking…" : "Check-in Today"}
              </button>
            </div>
          </li>
        ))}
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
              Icon Key
              <input
                type="text"
                value={formValues.iconKey}
                onChange={(e) =>
                  setFormValues({ ...formValues, iconKey: e.target.value })
                }
                placeholder="Optional icon identifier"
              />
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
