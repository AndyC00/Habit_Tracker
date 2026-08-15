import { useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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

type ChatPanelSize = {
  width: number;
  height: number;
};

type ChatPanelStyle = CSSProperties & {
  "--chat-panel-width"?: string;
  "--chat-panel-height"?: string;
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
  const [panelSize, setPanelSize] = useState<ChatPanelSize>({ width: 320, height: 0 });
  const [minimumPanelSize, setMinimumPanelSize] = useState<ChatPanelSize>({ width: 320, height: 0 });
  const [hasPanelSize, setHasPanelSize] = useState(false);
  const [hasMinimumPanelSize, setHasMinimumPanelSize] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const quickHabits = habits.filter((h) => !h.isArchived && !h.isExample).slice(0, 4);

  const panelStyle: ChatPanelStyle = hasPanelSize
    ? {
        "--chat-panel-width": `${panelSize.width}px`,
        "--chat-panel-height": `${panelSize.height}px`,
      }
    : {};

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();

    const resizeHandle = event.currentTarget;
    const panel = resizeHandle.parentElement as HTMLDivElement;
    const panelRect = panel.getBoundingClientRect();
    const renderedSize = { width: panelRect.width, height: panelRect.height };
    const minimumSize = hasMinimumPanelSize ? minimumPanelSize : renderedSize;
    const maximumSize = {
      width: Math.max(minimumSize.width, window.innerWidth - 40),
      height: Math.max(minimumSize.height, window.innerHeight - 40),
    };
    const startX = event.clientX;
    const startY = event.clientY;

    if (!hasMinimumPanelSize) {
      setMinimumPanelSize(renderedSize);
      setHasMinimumPanelSize(true);
    }

    setPanelSize(renderedSize);
    setHasPanelSize(true);
    setIsResizing(true);
    resizeHandle.setPointerCapture(event.pointerId);

    function handlePointerMove(moveEvent: PointerEvent) {
      const width = Math.min(
        maximumSize.width,
        Math.max(minimumSize.width, renderedSize.width + startX - moveEvent.clientX),
      );
      const height = Math.min(
        maximumSize.height,
        Math.max(minimumSize.height, renderedSize.height + startY - moveEvent.clientY),
      );

      setPanelSize({ width, height });
    }

    function stopResize() {
      resizeHandle.removeEventListener("pointermove", handlePointerMove);
      resizeHandle.removeEventListener("pointerup", handlePointerEnd);
      resizeHandle.removeEventListener("pointercancel", handlePointerEnd);
      resizeHandle.removeEventListener("lostpointercapture", stopResize);
      setIsResizing(false);
    }

    function handlePointerEnd(endEvent: PointerEvent) {
      if (resizeHandle.hasPointerCapture(endEvent.pointerId)) {
        resizeHandle.releasePointerCapture(endEvent.pointerId);
      }
      stopResize();
    }

    resizeHandle.addEventListener("pointermove", handlePointerMove);
    resizeHandle.addEventListener("pointerup", handlePointerEnd);
    resizeHandle.addEventListener("pointercancel", handlePointerEnd);
    resizeHandle.addEventListener("lostpointercapture", stopResize);
  };

  return (
    <div className={`chat-widget${isResizing ? " chat-widget--resizing" : ""}`}>
      {!chatOpen && (
        <button
          className="chat-toggle"
          type="button"
          onClick={() => setChatOpen(true)}
        >
          Habit Advice
        </button>
      )}

      {chatOpen && (
        <div
          className={`chat-panel${hasPanelSize ? " chat-panel--resized" : ""}`}
          style={panelStyle}
        >
          <div
            className="chat-resize-handle"
            title="Drag to resize chat"
            onPointerDown={startResize}
          />
          <div className="chat-header">
            <span>AI Habit Advice</span>
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
