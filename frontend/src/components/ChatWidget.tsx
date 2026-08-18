import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { ChatSpeechState } from "../hooks/useChatSpeech";
import type { ChatVoiceInputState } from "../hooks/useChatVoiceInput";
import { buildHabitContext } from "../lib/habitAiContext";
import type { Habit, Stats } from "../lib/localStore";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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
  speechState: ChatSpeechState;
  playSpeech: (messageIndex: number, text: string) => void;
  stopSpeech: () => void;
  voiceInputState: ChatVoiceInputState;
  startVoiceInput: () => void;
  finishVoiceInput: () => void;
  cancelVoiceInput: () => void;
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
  speechState,
  playSpeech,
  stopSpeech,
  voiceInputState,
  startVoiceInput,
  finishVoiceInput,
  cancelVoiceInput,
  chatOpen,
  setChatOpen,
}: ChatWidgetProps) {
  const [panelSize, setPanelSize] = useState<ChatPanelSize>({ width: 320, height: 0 });
  const [minimumPanelSize, setMinimumPanelSize] = useState<ChatPanelSize>({ width: 320, height: 0 });
  const [hasPanelSize, setHasPanelSize] = useState(false);
  const [hasMinimumPanelSize, setHasMinimumPanelSize] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const quickHabits = habits.filter((h) => !h.isArchived && !h.isExample).slice(0, 4);
  const voiceInputActive = voiceInputState.status !== "idle";
  const interactionLocked = chatPending || voiceInputActive;

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

  const handleVoicePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startVoiceInput();
  };

  const handleVoicePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    finishVoiceInput();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleVoiceKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    event.preventDefault();
    startVoiceInput();
  };

  const handleVoiceKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    finishVoiceInput();
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatError, chatMessages, voiceInputState.status, voiceInputState.transcript]);

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
              onClick={() => {
                stopSpeech();
                cancelVoiceInput();
                setChatOpen(false);
              }}
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
                  disabled={interactionLocked}
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
                    {msg.role === "assistant" && (
                      <div className="chat-speech-row">
                        {speechState.status === "generating" &&
                        speechState.messageIndex === idx ? (
                          <button type="button" className="chat-speech-button" disabled>
                            Generating voice...
                          </button>
                        ) : speechState.status === "playing" &&
                          speechState.messageIndex === idx ? (
                          <button
                            type="button"
                            className="chat-speech-button"
                            onClick={stopSpeech}
                          >
                            Stop voice
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="chat-speech-button"
                            onClick={() => playSpeech(idx, msg.content)}
                          >
                            {speechState.status === "ready" &&
                            speechState.messageIndex === idx
                              ? "Replay voice"
                              : speechState.status === "error" &&
                                  speechState.messageIndex === idx
                                ? "Retry voice"
                                : "Play voice"}
                          </button>
                        )}

                        {speechState.status === "blocked" &&
                          speechState.messageIndex === idx && (
                            <span className="chat-speech-status">
                              Autoplay was blocked. Click play to listen.
                            </span>
                          )}
                        {speechState.status === "error" &&
                          speechState.messageIndex === idx && (
                            <span className="chat-speech-status error">
                              {speechState.message}
                            </span>
                          )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {chatError && <p className="chat-error">{chatError}</p>}
            {voiceInputActive && (
              <div className="chat-bubble user chat-bubble--live">
                <span className="chat-role">You</span>
                <div>{voiceInputState.transcript || "Listening…"}</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-voice-control">
            <button
              type="button"
              className={`chat-voice-button${voiceInputActive ? " is-active" : ""}`}
              aria-label={voiceInputActive ? "Release to send voice message" : "Hold to talk"}
              title={voiceInputState.supported ? "Hold to talk" : "Voice input is unavailable"}
              disabled={
                !voiceInputState.supported ||
                chatPending ||
                voiceInputState.status === "stopping"
              }
              onPointerDown={handleVoicePointerDown}
              onPointerUp={handleVoicePointerUp}
              onPointerCancel={cancelVoiceInput}
              onKeyDown={handleVoiceKeyDown}
              onKeyUp={handleVoiceKeyUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              <Mic aria-hidden="true" size={24} strokeWidth={2.4} />
            </button>
            <span className="chat-voice-label">
              {voiceInputState.status === "listening"
                ? "Listening… release to send"
                : voiceInputState.status === "stopping"
                  ? "Finishing…"
                  : "Hold to talk"}
            </span>
            {!voiceInputState.supported && (
              <span className="chat-voice-error">
                Voice input is not supported in this browser.
              </span>
            )}
            {voiceInputState.error && (
              <span className="chat-voice-error">{voiceInputState.error}</span>
            )}
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
              disabled={interactionLocked}
            />
            <button type="submit" className="btn primary" disabled={interactionLocked}>
              {chatPending ? "Loading..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
