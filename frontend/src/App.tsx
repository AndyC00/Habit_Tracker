import { useState } from "react";
import type { FormEvent } from "react";
import { CloudSun, ThermometerSun } from "lucide-react";

import type { Habit } from "./lib/localStore";
import * as store from "./lib/localStore";
import { WeekChart, MonthChart, TotalChart } from "./lib/LineCharts";
import { logout } from "./lib/auth";
import ChatWidget from "./components/ChatWidget";
import SideTimerButtons from "./components/SideTimerButtons";
import { useAmbientInfo } from "./hooks/useAmbientInfo";
import { useChatAssistant } from "./hooks/useChatAssistant";
import { useDonationFlow } from "./hooks/useDonationFlow";
import { useHabitsData } from "./hooks/useHabitsData";
import { COLOR_OPTIONS } from "./lib/habitColors";
import { ICON_OPTIONS, getIconByKey } from "./lib/habitIcons";
import { functionsBase } from "./lib/env";
import { DonationDialog } from "./components/DonationDialog";
import { HabitFormModal, type HabitFormMode, type HabitFormValues } from "./components/HabitFormModal";
import { ArchivedHabitsModal } from "./components/ArchivedHabitsModal";

type FormMode = HabitFormMode | { type: "archived" };

const defaultFormValues: HabitFormValues = {
  name: "",
  description: "",
  colorHex: "",
  iconKey: "",
  isArchived: false,
};

async function handleLogout() {
  try {
    await logout();
  } catch (e) {
    console.error(e);
  }
}

export default function App() {
  const {
    habits,
    statsById,
    durationById,
    setDurationById,
    isExampleData,
    loading,
    error,
    pendingId,
    checkIn,
    undoToday,
    loadHabits,
    archivedHabits,
    archivedStatsById,
    loadArchived,
  } = useHabitsData();

  const {
    donateOpen,
    donateAmount,
    donatePending,
    donateError,
    donateClientSecret,
    donateStatus,
    setDonateAmount,
    setDonateError,
    setDonateStatus,
    openDonation,
    closeDonation,
    createPaymentIntent,
  } = useDonationFlow();

  const {
    chatOpen,
    setChatOpen,
    chatMessages,
    chatPending,
    chatError,
    chatDraft,
    setChatDraft,
    sendChatMessage,
  } = useChatAssistant(functionsBase);

  const { timeString, temperatureLabel, weatherLabel } = useAmbientInfo();

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [formValues, setFormValues] = useState<HabitFormValues>(defaultFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [openChart, setOpenChart] = useState<null | { type: "week" | "month" | "total"; habitId: number }>(null);

  function openCreateForm() {
    setFormValues(defaultFormValues);
    setFormMode({ type: "create" });
    setFormError(null);
  }

  async function openArchivedForm() {
    try {
      setFormError(null);
      await loadArchived();
      setFormMode({ type: "archived" });
    } catch (e: any) {
      setFormError(e.message ?? "Failed to load archived habits.");
    }
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
    if (!formMode || formMode.type === "archived") return;

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
      await loadHabits();
      closeForm();
    } catch (e: any) {
      setFormError(e.message ?? "Failed to save habit.");
    } finally {
      setFormPending(false);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <div className="container space-y-4">
        <div className="top-row">
          <h1 className="text-3xl font-semibold tracking-tight text-sky-50">Habit Tracker</h1>
          <button className="donate" onClick={openDonation}>
            buy me a coffee
          </button>
        </div>
        <div className="time-weather-row text-sm sm:text-base">
          <span className="font-semibold text-slate-200/90">{timeString}</span>
          <span className="local-temp shadow-lg shadow-sky-900/40">
            <ThermometerSun size={16} />
            <span>{temperatureLabel}</span>
          </span>
          <span className="local-weather shadow-lg shadow-sky-900/40">
            <CloudSun size={16} />
            <span>{weatherLabel}</span>
          </span>
        </div>

        <button className="logoutbtn" onClick={handleLogout}>
          Logout
        </button>
        
        <SideTimerButtons />

        <DonationDialog
          open={donateOpen}
          amount={donateAmount}
          pending={donatePending}
          error={donateError}
          status={donateStatus}
          clientSecret={donateClientSecret}
          onAmountChange={setDonateAmount}
          onClose={closeDonation}
          onCreateIntent={createPaymentIntent}
          setStatus={setDonateStatus}
          setError={setDonateError}
        />

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

        {formError && !formMode && <div className="habit-form-error">{formError}</div>}

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
                        ? "Saving..."
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
                      onClick={() => setOpenChart((cur) => (cur && cur.type === "week" && cur.habitId === h.id ? null : { type: "week", habitId: h.id }))}
                    >
                      Week Statistic
                    </button>
                    <button
                      className="btn stats"
                      style={{ marginLeft: 8 }}
                      onClick={() => setOpenChart((cur) => (cur && cur.type === "month" && cur.habitId === h.id ? null : { type: "month", habitId: h.id }))}
                    >
                      Month Statistic
                    </button>
                    <button
                      className="btn stats"
                      style={{ marginLeft: 8 }}
                      onClick={() => setOpenChart((cur) => (cur && cur.type === "total" && cur.habitId === h.id ? null : { type: "total", habitId: h.id }))}
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
                      {openChart.type === "week" && <WeekChart habitId={h.id} />}
                      {openChart.type === "month" && <MonthChart habitId={h.id} />}
                      {openChart.type === "total" && <TotalChart habitId={h.id} />}
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

        {formMode?.type === "archived" && (
          <ArchivedHabitsModal
            habits={archivedHabits}
            statsById={archivedStatsById}
            error={formError}
            onClose={closeForm}
          />
        )}

        {formMode && formMode.type !== "archived" && (
          <HabitFormModal
            mode={formMode}
            values={formValues}
            pending={formPending}
            error={formError}
            colorOptions={COLOR_OPTIONS}
            iconOptions={ICON_OPTIONS}
            onChange={setFormValues}
            onClose={closeForm}
            onSubmit={submitForm}
          />
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
      </div>
    </>
  );
}
