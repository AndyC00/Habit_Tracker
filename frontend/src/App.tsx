import { useEffect, useState } from "react"

// ------------------ constants and types ------------------
type Habit = {
  id: number,
  name: string,
  description?: string,
  colorHex?: string,
  iconKey?: string,
  isArchived: boolean
}
type CheckIn = {
  id: number,
  habitId: number,
  localDate: string,
  durationMinutes?: number
}

// ------------------ helper functions ------------------
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_API_BASE as string;
  if (!base) throw new Error("VITE_API_BASE in .env is not set");

  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
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
      setLoading(true)
      setHabits(await http<Habit[]>("/api/habits?includeArchived=false"))
    }
    catch (e: any) {
      setError(e.message ?? "Failed to load")
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function checkIn(habitId: number) {
    setPendingId(habitId);
    try {
      const body = {
        localDate: todayLocalISO(),
        durationMinutes: duration === "" ? null : Number(duration),
        userTimeZoneIana: Intl.DateTimeFormat().resolvedOptions().timeZone // e.g. Pacific/Auckland
      }
      await http<CheckIn>(`/api/habits/${habitId}/checkins`, {
        method: "POST",
        body: JSON.stringify(body)
      })
      await load();
    }
    catch (e: any) {
      alert(e.message ?? "Failed to check-in")
    }
    finally {
      setPendingId(null);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>
  if (error) return <div style={{ padding: 16, color: "red" }}>{error}</div>

  // --- output ---
  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1>Habit Tracker</h1>

      <div style={{ margin: "12px 0" }}>
        <label>Duration (minutes, optional): </label>
        <input
          type="number"
          min={0}
          value={duration}
          onChange={e => setDuration(e.target.value === "" ? "" : Number(e.target.value))}
          style={{ width: 120 }}
        />
        <span style={{ marginLeft: 12, opacity: 0.7 }}>today: {todayLocalISO()}</span>
      </div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {habits.map(h => (
          <li key={h.id} style={{
            border: "1px solid #333", borderRadius: 12, padding: 16,
            marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between",
            background: h.colorHex ?? "#1e1e1e"
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{h.name}</div>
              <div style={{ opacity: 0.8 }}>{h.description}</div>
            </div>
            <div>
              <button disabled={pendingId === h.id} onClick={() => checkIn(h.id)}>
                {pendingId === h.id ? "Checking…" : "Check-in Today"}
              </button>
            </div>
          </li>
        ))}
      </ul>

    </div>
  )
}
