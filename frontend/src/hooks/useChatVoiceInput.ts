import { useCallback, useEffect, useRef, useState } from "react";

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionResultList = {
  readonly length: number;
  readonly [index: number]: BrowserSpeechRecognitionResult;
};

type BrowserSpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
};

type BrowserSpeechRecognitionErrorEvent = {
  readonly error: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

export type ChatVoiceInputState = {
  supported: boolean;
  status: "idle" | "listening" | "stopping";
  transcript: string;
  error: string | null;
};

type VoiceRuntime = {
  recognition: BrowserSpeechRecognition | null;
  sessionId: number;
  isHolding: boolean;
  finishRequested: boolean;
  accumulatedTranscript: string;
  currentFinalTranscript: string;
  currentInterimTranscript: string;
};

type UseChatVoiceInputOptions = {
  disabled: boolean;
  onSubmit: (text: string) => void;
};

function getSpeechRecognitionConstructor() {
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function joinTranscript(...parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

function getRuntimeTranscript(runtime: VoiceRuntime) {
  return joinTranscript(
    runtime.accumulatedTranscript,
    runtime.currentFinalTranscript,
    runtime.currentInterimTranscript,
  );
}

function getRecognitionErrorMessage(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied. Allow microphone access and try again.";
    case "audio-capture":
      return "No microphone is available.";
    case "network":
      return "Voice recognition could not reach the speech service.";
    case "language-not-supported":
      return "English voice recognition is not supported by this browser.";
    default:
      return "Voice recognition failed. Please try again.";
  }
}

export function useChatVoiceInput({ disabled, onSubmit }: UseChatVoiceInputOptions) {
  const [voiceInputState, setVoiceInputState] = useState<ChatVoiceInputState>(() => ({
    supported: Boolean(getSpeechRecognitionConstructor()),
    status: "idle",
    transcript: "",
    error: null,
  }));
  const runtimeRef = useRef<VoiceRuntime>({
    recognition: null,
    sessionId: 0,
    isHolding: false,
    finishRequested: false,
    accumulatedTranscript: "",
    currentFinalTranscript: "",
    currentInterimTranscript: "",
  });

  const startVoiceInput = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    const runtime = runtimeRef.current;
    if (disabled || runtime.isHolding || !SpeechRecognition) return;

    runtime.sessionId += 1;
    const sessionId = runtime.sessionId;
    runtime.isHolding = true;
    runtime.finishRequested = false;
    runtime.accumulatedTranscript = "";
    runtime.currentFinalTranscript = "";
    runtime.currentInterimTranscript = "";

    setVoiceInputState({
      supported: true,
      status: "listening",
      transcript: "",
      error: null,
    });

    const terminateWithError = (message: string) => {
      const currentRuntime = runtimeRef.current;
      if (currentRuntime.sessionId !== sessionId) return;

      currentRuntime.sessionId += 1;
      currentRuntime.isHolding = false;
      currentRuntime.finishRequested = false;
      currentRuntime.recognition = null;
      setVoiceInputState({
        supported: true,
        status: "idle",
        transcript: "",
        error: message,
      });
    };

    const launchRecognition = () => {
      const currentRuntime = runtimeRef.current;
      if (currentRuntime.sessionId !== sessionId || !currentRuntime.isHolding) return;

      const recognition = new SpeechRecognition();
      currentRuntime.recognition = recognition;
      currentRuntime.currentFinalTranscript = "";
      currentRuntime.currentInterimTranscript = "";

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const activeRuntime = runtimeRef.current;
        if (activeRuntime.sessionId !== sessionId) return;

        const finalParts: string[] = [];
        const interimParts: string[] = [];

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0].transcript;
          if (result.isFinal) {
            finalParts.push(transcript);
          } else {
            interimParts.push(transcript);
          }
        }

        activeRuntime.currentFinalTranscript = joinTranscript(...finalParts);
        activeRuntime.currentInterimTranscript = joinTranscript(...interimParts);
        setVoiceInputState({
          supported: true,
          status: activeRuntime.finishRequested ? "stopping" : "listening",
          transcript: getRuntimeTranscript(activeRuntime),
          error: null,
        });
      };

      recognition.onerror = (event) => {
        const activeRuntime = runtimeRef.current;
        if (activeRuntime.sessionId !== sessionId || event.error === "aborted") return;

        if (event.error === "no-speech") {
          setVoiceInputState((previous) => ({
            ...previous,
            error: "No speech was detected. Keep holding and try again.",
          }));
          return;
        }

        terminateWithError(getRecognitionErrorMessage(event.error));
      };

      recognition.onend = () => {
        const activeRuntime = runtimeRef.current;
        if (activeRuntime.sessionId !== sessionId) return;

        activeRuntime.recognition = null;
        activeRuntime.accumulatedTranscript = joinTranscript(
          activeRuntime.accumulatedTranscript,
          activeRuntime.currentFinalTranscript,
          activeRuntime.currentInterimTranscript,
        );
        activeRuntime.currentFinalTranscript = "";
        activeRuntime.currentInterimTranscript = "";

        if (activeRuntime.finishRequested) {
          const transcript = activeRuntime.accumulatedTranscript.trim();
          activeRuntime.finishRequested = false;
          setVoiceInputState({
            supported: true,
            status: "idle",
            transcript: "",
            error: transcript ? null : "No speech was detected.",
          });
          if (transcript) onSubmit(transcript);
          return;
        }

        if (activeRuntime.isHolding) {
          launchRecognition();
        }
      };

      try {
        recognition.start();
      } catch {
        terminateWithError("Voice recognition could not start. Please try again.");
      }
    };

    launchRecognition();
  }, [disabled, onSubmit]);

  const finishVoiceInput = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime.isHolding) return;

    runtime.isHolding = false;
    runtime.finishRequested = true;
    setVoiceInputState((previous) => ({
      ...previous,
      status: "stopping",
    }));

    if (runtime.recognition) {
      runtime.recognition.stop();
    }
  }, []);

  const cancelVoiceInput = useCallback(() => {
    const runtime = runtimeRef.current;
    runtime.sessionId += 1;
    runtime.isHolding = false;
    runtime.finishRequested = false;
    runtime.accumulatedTranscript = "";
    runtime.currentFinalTranscript = "";
    runtime.currentInterimTranscript = "";

    if (runtime.recognition) {
      runtime.recognition.abort();
      runtime.recognition = null;
    }

    setVoiceInputState((previous) => ({
      supported: previous.supported,
      status: "idle",
      transcript: "",
      error: null,
    }));
  }, []);

  useEffect(() => {
    window.addEventListener("blur", cancelVoiceInput);
    return () => window.removeEventListener("blur", cancelVoiceInput);
  }, [cancelVoiceInput]);

  useEffect(
    () => () => {
      const runtime = runtimeRef.current;
      runtime.sessionId += 1;
      if (runtime.recognition) runtime.recognition.abort();
    },
    [],
  );

  return {
    voiceInputState,
    startVoiceInput,
    finishVoiceInput,
    cancelVoiceInput,
  };
}
