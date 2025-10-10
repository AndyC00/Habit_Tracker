import { useEffect, useState } from "react";

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

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  // --- output ---
  return (
    <div className="container">
      <h1>Habit Tracker</h1>

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
            <div>
              <div className="habit-title">{h.name}</div>
              <div className="habit-desc">{h.description}</div>
            </div>
            <div>
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
    </div>
  );
}
