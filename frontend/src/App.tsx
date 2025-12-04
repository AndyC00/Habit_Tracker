import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Dumbbell, BookOpen, Droplet, Moon, Code, Music, Coffee, Target, Timer, Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import * as store from "./lib/localStore";
import type { Habit, Stats } from "./lib/localStore";
import { WeekChart, MonthChart, TotalChart } from "./lib/LineCharts";
import { loadActiveHabitsWithStats, loadArchivedHabitsWithStats, getStatsForHabit } from "./lib/services/habitService";

import { logout } from "./lib/auth";

// ------------------ constants and types ------------------
type HabitFormValues = {
  name: string;
  description: string;
  colorHex: string;
  iconKey: string;
  isArchived: boolean;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

// ------------------ helper functions ------------------
async function handleLogout() {
  try {
    await logout();
  } 
  catch (e) {
    console.error(e);
  }
}

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getIconByKey(key?: string | null): LucideIcon {
  if (!key) return DEFAULT_ICON;
  return (ICONS as Record<string, LucideIcon>)[key] ?? DEFAULT_ICON;
}

function buildHabitContext(habit: Habit, stats?: Stats, todayMinutes?: number | "" | undefined) {
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

const COLOR_OPTIONS: { name: string; value: string }[] = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Fuchsia", value: "#d946ef" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Slate", value: "#64748b" },
  { name: "Gray", value: "#6b7280" },
  { name: "Zinc", value: "#71717a" },
  { name: "Neutral", value: "#737373" },
  { name: "Stone", value: "#78716c" },
  { name: "Brown", value: "#92400e" },
  { name: "Black", value: "#000000" },
  { name: "White", value: "#ffffff" },
];

// ------------------ main component ------------------
export default function App() {
  // --- inner state & constants ---
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExampleData, setIsExampleData] = useState(false);

  const [statsById, setStatsById] = useState<Record<number, Stats | undefined>>({});
  const [durationById, setDurationById] = useState<Record<number, number | "" | undefined>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [archivedStatsById, setArchivedStatsById] = useState<Record<number, Stats | undefined>>({});
  const [openChart, setOpenChart] = useState<null | { type: 'week' | 'month' | 'total'; habitId: number }>(null);

  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<number | "">(2);
  const [donatePending, setDonatePending] = useState(false);
  const [donateError, setDonateError] = useState<string | null>(null);
  const [donateClientSecret, setDonateClientSecret] = useState<string | null>(null);
  const [donateStatus, setDonateStatus] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const functionsBase = (import.meta.env.VITE_FUNCTIONS_URL || "").replace(/\/$/, "");

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
    | { type: "archived" }
  >(null);

  const [formValues, setFormValues] = useState<HabitFormValues>(defaultFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [now, setNow] = useState<Date>(new Date());

  // --- inner functions ---
  function handleDonate() {
    setDonateError(null);
    setDonateStatus(null);
    setDonateClientSecret(null);
    setDonateOpen(true);
  }

  async function handleDonateConfirm() {
    if (donateAmount === "" || donateAmount < 0.5) {
      setDonateError("Amount must be at least 0.5 NZD.");
      return;
    }
    if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
      setDonateError("Missing VITE_STRIPE_PUBLISHABLE_KEY in env.");
      return;
    }

    setDonatePending(true);
    setDonateError(null);
    setDonateStatus(null);

    try {
      const cents = Math.round(donateAmount * 100);

      const res = await fetch("/.netlify/functions/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: cents }),
      });

      const data = await res.json();

      if (!res.ok || !data.clientSecret) {
        setDonateError(data.error ?? "Failed to create payment intent.");
        return;
      }

      setDonateClientSecret(data.clientSecret);
      setDonateStatus("Payment intent created. Please enter card details to pay.");
    } catch (e: any) {
      setDonateError(e.message ?? "Unexpected error.");
    } finally {
      setDonatePending(false);
    }
  }

  async function sendChatMessage(messageText: string, habitContext?: string) {
    if (chatPending) return;
    const text = messageText.trim();
    if (!text) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const history = [...chatMessages, userMessage];

    setChatDraft("");
    setChatError(null);
    setChatMessages(history);
    setChatPending(true);
    setChatOpen(true);

    try {
      const res = await fetch(`${functionsBase}/.netlify/functions/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, habitContext }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Chat request failed.");
      }

      const reply = data?.reply;
      if (!reply) {
        throw new Error("No reply from assistant.");
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setChatError(e.message ?? "Chat failed.");
    } finally {
      setChatPending(false);
    }
  }

  async function load() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      setLoading(true);
      const { habits: list, statsById: statsMap, durationById: durMap, isExample } = await loadActiveHabitsWithStats(tz);
      setHabits(list);
      setStatsById(statsMap);
      setDurationById(durMap);
      setIsExampleData(isExample);
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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function checkIn(habitId: number) {
    if (isExampleData) return;
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
  }

  async function refreshStatsFor(habitId: number) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { stats, todayDuration } = await getStatsForHabit(habitId, tz);

    setStatsById((prev) => ({ ...prev, [habitId]: stats }));
    setDurationById((prev) => ({ ...prev, [habitId]: todayDuration }));
  }

  // --- form functions ---
  function openCreateForm() {
    setFormValues(defaultFormValues);
    setFormMode({ type: "create" });
    setFormError(null);
  }

  function openArchivedForm() {
    (async () => {
      try {
        setFormError(null);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { habits: archived, statsById } = await loadArchivedHabitsWithStats(tz);
        setArchivedHabits(archived);
        setArchivedStatsById(statsById);

        setFormMode({ type: "archived" });
      } catch (e: any) {
        setFormError(e.message ?? "Failed to load archived habits.");
      }
    })();
  }

  function openEditForm(habit: Habit) {
    if (habit.isExample) return;
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
      } 
      else if (formMode.type === "edit") {
        await store.updateHabit(formMode.habitId, { ...payload, isArchived: formValues.isArchived });
      } 
      else {
        // If somehow submitting while in archived or an unknown mode, bail out.
        setFormError("Cannot submit form in current mode.");
        setFormPending(false);
        return;
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
      <div style={{ marginBottom: 12, opacity: 0.85 }}>
        {new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }).format(now)}
      </div>

      <button className="logoutbtn" onClick={handleLogout}>
        Logout
      </button>

      <button className="donate" onClick={handleDonate}>
        buy me a coffee☕
      </button>

      {donateOpen && (
        <div
          className="donate-overlay"
          role="presentation"
          onClick={() => !donatePending && setDonateOpen(false)}
        >
          <div
            className="habit-form"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Support this app</h2>
            <p style={{ marginTop: 4, marginBottom: 8 }}>
              Choose an amount, create the payment intent, then enter card details to pay.
            </p>

            {!donateClientSecret && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[2, 5, 10].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="btn"
                      style={{
                        background: donateAmount === v ? "#44b0de" : undefined,
                        borderColor: donateAmount === v ? "#44b0de" : undefined,
                      }}
                      onClick={() => setDonateAmount(v)}
                      disabled={donatePending}
                    >
                      ${v}
                    </button>
                  ))}
                </div>

                <label>
                  Custom amount (NZD)
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={donateAmount === "" ? "" : donateAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDonateAmount(value === "" ? "" : Number(value));
                    }}
                    disabled={donatePending}
                  />
                </label>
              </>
            )}

            {donateStatus && (
              <div className="habit-form-info">{donateStatus}</div>
            )}

            {donateError && (
              <div className="habit-form-error">{donateError}</div>
            )}

            {donateClientSecret ? (
              <Elements
                key={donateClientSecret}
                stripe={stripePromise}
                options={{ clientSecret: donateClientSecret }}
              >
                <DonatePaymentForm
                  onClose={() => setDonateOpen(false)}
                  setStatus={setDonateStatus}
                  setError={setDonateError}
                />
              </Elements>
            ) : (
              <div className="habit-form-actions">
                <button
                  className="btn"
                  onClick={() => setDonateOpen(false)}
                  disabled={donatePending}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={handleDonateConfirm}
                  disabled={donatePending}
                >
                  {donatePending ? "Processing..." : "Create Payment"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn archive" onClick={openArchivedForm}>
          Archived Habits
        </button>
        <button className="btn primary" onClick={openCreateForm}>
          New Habit
        </button>
      </div>

      {isExampleData && (
        <div className="habit-form-info" style={{ marginBottom: 12 }}>
          Showing an example habit. Create your first habit to start tracking your own data.
        </div>
      )}

      <ul className="habits">
        {habits.map((h) => {
          const stats = statsById[h.id];
          const dur = durationById[h.id] ?? "";
          const bg = h.colorHex ?? "#1e1e1e";
          const isExampleHabit = !!h.isExample;

          return (
            <li key={h.id} className="habit-item" style={{ ["--bg" as any]: bg }}>
              <div className="habit-info">
                <div className="habit-title">
                  {(() => {
                    const Icon = getIconByKey(h.iconKey);
                    return <Icon className="habit-icon" size={18} />;
                  })()}
                  {h.name}
                  {isExampleHabit && <span className="habit-archived">Example</span>}
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
                    onChange={(e) => {
                      if (isExampleHabit) return;
                      setDurationById((prev) => ({
                        ...prev,
                        [h.id]: e.target.value === "" ? "" : Number(e.target.value),
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (isExampleHabit) return;
                      if (e.key === "Enter" && pendingId !== h.id) {
                        e.preventDefault();
                        checkIn(h.id);
                      }
                    }}
                    style={{ width: 120, marginRight: 8 }}
                    placeholder="optional"
                    disabled={isExampleHabit}
                  />
                  <button
                    className="btn operation"
                    disabled={isExampleHabit || pendingId === h.id}
                    onClick={() => {
                      if (isExampleHabit) return;
                      checkIn(h.id);
                    }}
                    title={isExampleHabit ? "Example habit is read-only" : stats?.hasTodayCheckIn ? "Update today's minutes" : "Check-in today"}
                  >
                    {pendingId === h.id
                      ? "Saving…"
                      : stats?.hasTodayCheckIn
                        ? "Update Today"
                        : "Check-in Today"}
                  </button>

                  <button
                    className="btn operation"
                    disabled={isExampleHabit || pendingId === h.id || !stats?.hasTodayCheckIn}
                    onClick={() => {
                      if (isExampleHabit) return;
                      undoToday(h.id);
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    Undo Today
                  </button>
                  <button
                    className="btn operation"
                    disabled={isExampleHabit}
                    onClick={() => {
                      if (isExampleHabit) return;
                      openEditForm(h);
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    Edit
                  </button>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn stats"
                    onClick={() => setOpenChart((cur) => (cur && cur.type === 'week' && cur.habitId === h.id ? null : { type: 'week', habitId: h.id }))}
                  >
                    Week Statistic
                  </button>
                  <button
                    className="btn stats"
                    style={{ marginLeft: 8 }}
                    onClick={() => setOpenChart((cur) => (cur && cur.type === 'month' && cur.habitId === h.id ? null : { type: 'month', habitId: h.id }))}
                  >
                    Month Statistic
                  </button>
                  <button
                    className="btn stats"
                    style={{ marginLeft: 8 }}
                    onClick={() => setOpenChart((cur) => (cur && cur.type === 'total' && cur.habitId === h.id ? null : { type: 'total', habitId: h.id }))}
                  >
                    Total Statistic
                  </button>
                </div>
              </div>
              {openChart?.habitId === h.id && (
                <div
                  className="habit-chart-overlay"
                  role="presentation"
                  onClick={() => setOpenChart(null)}
                >
                  <div className="habit-chart-inner" onClick={(e) => e.stopPropagation()}>
                    {openChart.type === 'week' && <WeekChart habitId={h.id} />}
                    {openChart.type === 'month' && <MonthChart habitId={h.id} />}
                    {openChart.type === 'total' && <TotalChart habitId={h.id} />}
                    <button
                      className="habit-chart-close"
                      onClick={(e) => { e.stopPropagation(); setOpenChart(null); }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {formMode && (
        <div className="habit-form-backdrop" role="presentation">
          {formMode.type === "archived" ? (
            <div className="habit-form habit-form-archived">
              <h2>Archived Habits</h2>
              <div className="habit-archived-content">
                {archivedHabits.length === 0 ? (
                  <div>No archived habits.</div>
                ) : (
                  <ul className="habits">
                    {archivedHabits.map((h) => {
                      const stats = archivedStatsById[h.id];
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
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="habit-form-actions">
                <button type="button" className="btn" onClick={closeForm}>Close</button>
              </div>
            </div>
          ) : (
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
              Color
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={formValues.colorHex}
                  onChange={(e) =>
                    setFormValues({ ...formValues, colorHex: e.target.value })
                  }
                >
                  <option value="">(None)</option>
                  {COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.name}</option>
                  ))}
                </select>
                <span title={formValues.colorHex || "default"}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      display: "inline-block",
                      borderRadius: 4,
                      border: "1px solid #444",
                      background: formValues.colorHex || "#1e1e1e",
                    }}
                  />
                </span>
              </div>
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
          )}
        </div>
      )}

      <div className="chat-widget">
        <button
          className="chat-toggle"
          type="button"
          onClick={() => setChatOpen((prev) => !prev)}
        >
          {chatOpen ? "Close Chat" : "Chat"}
        </button>

          {chatOpen && (
          <div className="chat-panel">
            <div className="chat-header">
              <span>AI habit advisor</span>
              <button
                type="button"
                className="chat-close"
                onClick={() => setChatOpen(false)}
                >
                  X
                </button>
              </div>

              {(() => {
                const quick = habits.filter((h) => !h.isArchived && !h.isExample).slice(0, 4);
                if (quick.length === 0) return null;
                return (
                  <div className="chat-quick-row">
                    {quick.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="btn chat-quick"
                        disabled={chatPending}
                        onClick={() => {
                          const stats = statsById[h.id];
                          const today = durationById[h.id];
                          const context = buildHabitContext(h, stats, today);
                          const prompt = `Please review my habit "${h.name}" and provide evaluation and improvement suggestions based on the data.`;
                          sendChatMessage(prompt, context);
                        }}
                      >
                        {h.name}
                      </button>
                    ))}
                  </div>
                );
              })()}

              <div className="chat-body">
                {chatMessages.length === 0 ? (
                  <p className="chat-empty">Say hi to start the conversation.</p>
                ) : (
                  <ul>
                  {chatMessages.map((msg, idx) => (
                    <li key={idx} className={`chat-bubble ${msg.role}`}>
                      <span className="chat-role">{msg.role === "user" ? "You" : "AI"}</span>
                      <div>{msg.content}</div>
                    </li>
                  ))}
                </ul>
              )}
                {chatError && <p className="chat-error">{chatError}</p>}
              </div>

              <form
                className="chat-input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage(chatDraft);
                }}
              >
                <input
                  type="text"
                  placeholder="Ask about your habits..."
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                disabled={chatPending}
              />
              <button type="submit" className="btn primary" disabled={chatPending}>
                {chatPending ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function DonatePaymentForm({
  onClose,
  setStatus,
  setError,
}: {
  onClose: () => void;
  setStatus: (msg: string | null) => void;
  setError: (msg: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitPending, setSubmitPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) {
      setError("Stripe not ready yet.");
      return;
    }

    setSubmitPending(true);
    setError(null);
    setStatus(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      setError(error.message ?? "Payment failed.");
    } else if (paymentIntent) {
      if (paymentIntent.status === "succeeded") {
        setStatus("Payment succeeded. Thank you!");
        onClose();
      } else {
        setStatus(`Payment status: ${paymentIntent.status}`);
      }
    }

    setSubmitPending(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PaymentElement />
      <div className="habit-form-actions">
        <button
          className="btn"
          type="button"
          onClick={onClose}
          disabled={submitPending}
        >
          Close
        </button>
        <button className="btn primary" type="submit" disabled={submitPending || !stripe}>
          {submitPending ? "Paying..." : "Pay now"}
        </button>
      </div>
    </form>
  );
}

