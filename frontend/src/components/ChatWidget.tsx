import type { Habit, Stats } from "../lib/localStore";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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

type ChatWidgetProps = {
  habits: Habit[];
  statsById: Record<number, Stats | undefined>;
  durationById: Record<number, number | "" | undefined>;
  chatMessages: ChatMessage[];
  chatPending: boolean;
  chatError: string | null;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  sendChatMessage: (text: string, habitContext?: string) => void;
  chatOpen: boolean;
  setChatOpen: (value: boolean) => void;
};

export default function ChatWidget({
  habits,
  statsById,
  durationById,
  chatMessages,
  chatPending,
  chatError,
  chatDraft,
  setChatDraft,
  sendChatMessage,
  chatOpen,
  setChatOpen,
}: ChatWidgetProps) {
  const quickHabits = habits.filter((h) => !h.isArchived && !h.isExample).slice(0, 4);

  return (
    <div className="chat-widget">
      <button
        className="chat-toggle"
        type="button"
        onClick={() => setChatOpen((prev) => !prev)}
      >
        Chat
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

          {quickHabits.length > 0 && (
            <div className="chat-quick-row">
              {quickHabits.map((h) => (
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
          )}

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
              {chatPending ? "Loading..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
