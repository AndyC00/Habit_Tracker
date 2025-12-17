import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Dumbbell, BookOpen, Droplet, Moon, Code, Music, Coffee, Target, Timer, Circle, ThermometerSun, CloudSun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import * as store from "./lib/localStore";
import type { Habit, Stats } from "./lib/localStore";
import { WeekChart, MonthChart, TotalChart } from "./lib/LineCharts";
import { loadActiveHabitsWithStats, loadArchivedHabitsWithStats, getStatsForHabit } from "./lib/services/habitService";

import { logout } from "./lib/auth";
import ChatWidget, { type ChatMessage } from "./components/ChatWidget";
import SideTimerButtons from "./components/SideTimerButtons";

// ------------------ constants and types ------------------
type HabitFormValues = {
  name: string;
  description: string;
  colorHex: string;
  iconKey: string;
  isArchived: boolean;
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
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

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

function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code === 51 || code === 53 || code === 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing drizzle";
  if (code === 61 || code === 63 || code === 65) return "Rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code === 71 || code === 73 || code === 75) return "Snowfall";
  if (code === 77) return "Snow grains";
  if (code === 80 || code === 81 || code === 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return "Weather unavailable";
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
  const functionsBase =
    (import.meta.env.VITE_FUNCTIONS_URL || "").replace(/\/$/, "") ||
    (import.meta.env.DEV ? "http://localhost:8888" : "");

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
  const [localTempC, setLocalTempC] = useState<number | null>(null);
  const [localWeather, setLocalWeather] = useState<string | null>(null);
  const [tempStatus, setTempStatus] = useState<"idle" | "loading" | "error" | "unsupported">("loading");

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

      const raw = await res.text();
      let data: any = null;
      let parseError: Error | null = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (err: any) {
          parseError = err;
        }
      }

      if (!res.ok) {
        const detail = typeof data === "object" ? JSON.stringify(data) : "";
        if (res.status === 404) {
          throw new Error("Chat function not found (404). Are Netlify functions running? Try `netlify dev`.");
        }
        throw new Error(data?.error || `Chat request failed (${res.status}) ${detail}`);
      }

      if (parseError) {
        throw new Error(`Invalid chat response: ${parseError.message || "parse error"}`);
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

  useEffect(() => {
    let cancelled = false;
    let lastCoords: { lat: number; lon: number } | null = null;
    let hasFetchedTemp = false;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setTempStatus("unsupported");
      setLocalWeather(null);
      return;
    }

    async function fetchTemperature(lat: number, lon: number, showLoading: boolean) {
      if (showLoading) {
        setTempStatus("loading");
      }
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`,
        );
        const data = await res.json();
        if (cancelled) return;

        const temp = data?.current_weather?.temperature;
        const weatherCode = data?.current_weather?.weathercode;
        if (typeof temp === "number") {
          hasFetchedTemp = true;
          setLocalTempC(temp);
          if (typeof weatherCode === "number") {
            setLocalWeather(describeWeatherCode(weatherCode));
          } else {
            setLocalWeather(null);
          }
          setTempStatus("idle");
        } else {
          throw new Error("Missing temperature");
        }
      } catch (e) {
        if (!cancelled) {
          setLocalWeather(null);
          setTempStatus("error");
        }
      }
    }

    const requestTemperature = (showLoading: boolean) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const coords = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          };
          lastCoords = coords;
          fetchTemperature(coords.lat, coords.lon, showLoading);
        },
        () => {
          if (!cancelled) {
            setLocalWeather(null);
            setTempStatus("error");
          }
        },
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 15 * 60 * 1000 },
      );
    };

    requestTemperature(true);

    const refreshId = window.setInterval(() => {
      if (lastCoords) {
        fetchTemperature(lastCoords.lat, lastCoords.lon, !hasFetchedTemp);
      } else {
        requestTemperature(!hasFetchedTemp);
      }
    }, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshId);
    };
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

  const timeString = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(now);

  const temperatureLabel = (() => {
    if (localTempC !== null) {
      return `Local ${Math.round(localTempC)}\u00b0C`;
    }
    if (tempStatus === "unsupported") return "Local temp unavailable";
    if (tempStatus === "error") return "Temperature unavailable";
    return "Loading local temp...";
  })();

  const weatherLabel = (() => {
    if (localWeather) return localWeather;
    if (tempStatus === "unsupported") return "Local weather unavailable";
    if (tempStatus === "error") return "Weather unavailable";
    if (tempStatus === "idle") return "Weather unavailable";
    return "Loading local weather...";
  })();

  // --- output ---
  return (
    <div className="container">
      <h1>Habit Tracker</h1>
      <div className="time-weather-row">
        <span>{timeString}</span>
        <span className="local-temp">
          <ThermometerSun size={16} />
          <span>{temperatureLabel}</span>
        </span>
        <span className="local-weather">
          <CloudSun size={16} />
          <span>{weatherLabel}</span>
        </span>
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
              stripePromise ? (
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
                <div className="habit-form-error">
                  Missing Stripe publishable key. Set VITE_STRIPE_PUBLISHABLE_KEY to use donations.
                </div>
              )
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

      <ChatWidget
        habits={habits}
        statsById={statsById}
        durationById={durationById}
        chatMessages={chatMessages}
        chatPending={chatPending}
        chatError={chatError}
        chatDraft={chatDraft}
        setChatDraft={setChatDraft}
        sendChatMessage={sendChatMessage}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
      />
      <SideTimerButtons />
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
