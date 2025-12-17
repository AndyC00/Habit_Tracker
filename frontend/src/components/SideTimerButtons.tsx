import { useEffect, useMemo, useRef, useState } from "react";

type ActiveTimer = {
  label: string;
  endTime: number;
  totalMs: number;
};

const PRESETS = [
  { minutes: 15, label: "15mins" },
  { minutes: 25, label: "25mins" },
  { minutes: 45, label: "45mins" },
  { minutes: 60, label: "60mins" },
];

function formatMs(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.round(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function SideTimerButtons() {
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [lastFinished, setLastFinished] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const hasActive = !!active;
  const progress = useMemo(() => {
    if (!active) return 0;
    return Math.max(0, Math.min(1, 1 - remainingMs / active.totalMs));
  }, [active, remainingMs]);

  function clearTimers() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function ensureAudioCtx() {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  function playAlarm() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const duration = 1.1;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.05);
  }

  function startTimer(minutes: number, label: string) {
    const totalMs = minutes * 60 * 1000;
    const endTime = Date.now() + totalMs;
    clearTimers();
    ensureAudioCtx(); // warm up/resume once while the click is a user gesture
    setActive({ label, endTime, totalMs });
    setRemainingMs(totalMs);
    setLastFinished(null);
  }

  function stopActive() {
    clearTimers();
    setActive(null);
    setRemainingMs(0);
    setLastFinished(null);
  }

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      setRemainingMs(Math.max(0, active.endTime - Date.now()));
    };

    tick();
    intervalRef.current = window.setInterval(tick, 500);
    timeoutRef.current = window.setTimeout(() => {
      setRemainingMs(0);
      setLastFinished(active.label);
      setActive(null);
      playAlarm();
    }, Math.max(0, active.endTime - Date.now()));

    return clearTimers;
  }, [active]);

  useEffect(() => () => clearTimers(), []);

  return (
    <div className="timer-rail">
      <div className="timer-rail-title">Quick timers</div>
      <div className="timer-rail-buttons">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`btn timer-btn${active?.label === preset.label ? " active" : ""}`}
            onClick={() => startTimer(preset.minutes, preset.label)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {hasActive && active && (
        <div className="timer-status">
          <div className="timer-status-row">
            <span>Counting {active.label}</span>
            <button type="button" className="timer-cancel" onClick={stopActive}>
              Stop
            </button>
          </div>
          <div className="timer-remaining">{formatMs(remainingMs)}</div>
          <div className="timer-progress">
            <div className="timer-progress-bar" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {!hasActive && lastFinished && (
        <div className="timer-finished">
          {lastFinished} done
        </div>
      )}
    </div>
  );
}
