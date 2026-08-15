import { useCallback, useEffect, useRef, useState } from "react";
import { getFunctionAuthHeaders } from "../lib/auth";

export type ChatSpeechState =
  | { status: "idle" }
  | { status: "generating"; messageIndex: number }
  | { status: "playing"; messageIndex: number }
  | { status: "ready"; messageIndex: number }
  | { status: "blocked"; messageIndex: number }
  | { status: "error"; messageIndex: number; message: string };

type SpeechRuntime = {
  audio: HTMLAudioElement | null;
  request: AbortController | null;
  requestId: number;
  audioUrls: Map<number, string>;
};

type TtsResponse = {
  audioUrl?: string;
  error?: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Voice playback failed.";
}

export function useChatSpeech(functionsBase: string) {
  const [speechState, setSpeechState] = useState<ChatSpeechState>({ status: "idle" });
  const runtimeRef = useRef<SpeechRuntime>({
    audio: null,
    request: null,
    requestId: 0,
    audioUrls: new Map(),
  });

  const stopCurrentAudio = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime.audio) {
      runtime.audio.pause();
      runtime.audio.currentTime = 0;
      runtime.audio = null;
    }
  }, []);

  const playAudio = useCallback(
    (messageIndex: number, audioUrl: string, requestId: number) => {
      const runtime = runtimeRef.current;
      stopCurrentAudio();

      const audio = new Audio(audioUrl);
      runtime.audio = audio;
      setSpeechState({ status: "ready", messageIndex });

      audio.addEventListener(
        "ended",
        () => {
          if (runtime.requestId !== requestId || runtime.audio !== audio) return;
          runtime.audio = null;
          setSpeechState({ status: "ready", messageIndex });
        },
        { once: true },
      );

      audio.addEventListener(
        "error",
        () => {
          if (runtime.requestId !== requestId || runtime.audio !== audio) return;
          runtime.audio = null;
          setSpeechState({
            status: "error",
            messageIndex,
            message: "The generated voice could not be loaded.",
          });
        },
        { once: true },
      );

      audio
        .play()
        .then(() => {
          if (runtime.requestId !== requestId || runtime.audio !== audio) return;
          setSpeechState({ status: "playing", messageIndex });
        })
        .catch((error: unknown) => {
          if (runtime.requestId !== requestId || runtime.audio !== audio) return;
          runtime.audio = null;
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            setSpeechState({ status: "blocked", messageIndex });
            return;
          }
          setSpeechState({ status: "error", messageIndex, message: getErrorMessage(error) });
        });
    },
    [stopCurrentAudio],
  );

  const playSpeech = useCallback(
    (messageIndex: number, text: string) => {
      const runtime = runtimeRef.current;
      runtime.requestId += 1;
      const requestId = runtime.requestId;

      if (runtime.request) {
        runtime.request.abort();
        runtime.request = null;
      }
      stopCurrentAudio();

      const cachedAudioUrl = runtime.audioUrls.get(messageIndex);
      if (cachedAudioUrl) {
        playAudio(messageIndex, cachedAudioUrl, requestId);
        return;
      }

      if (text.length > 2000) {
        setSpeechState({
          status: "error",
          messageIndex,
          message: "This reply is too long to generate voice playback.",
        });
        return;
      }

      const controller = new AbortController();
      runtime.request = controller;
      setSpeechState({ status: "generating", messageIndex });

      const requestVoice = async () => {
        try {
          const authHeaders = await getFunctionAuthHeaders();
          const response = await fetch(`${functionsBase}/.netlify/functions/tts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          const raw = await response.text();
          const data = JSON.parse(raw) as TtsResponse;

          if (!response.ok) {
            throw new Error(data.error || `Voice generation failed (${response.status}).`);
          }
          if (!data.audioUrl) throw new Error("No audio returned from voice generation.");
          if (runtime.requestId !== requestId) return;

          runtime.request = null;
          runtime.audioUrls.set(messageIndex, data.audioUrl);
          playAudio(messageIndex, data.audioUrl, requestId);
        } catch (error: unknown) {
          if (controller.signal.aborted || runtime.requestId !== requestId) return;
          runtime.request = null;
          setSpeechState({ status: "error", messageIndex, message: getErrorMessage(error) });
        }
      };

      void requestVoice();
    },
    [functionsBase, playAudio, stopCurrentAudio],
  );

  const stopSpeech = useCallback(() => {
    const runtime = runtimeRef.current;
    runtime.requestId += 1;
    if (runtime.request) {
      runtime.request.abort();
      runtime.request = null;
    }
    stopCurrentAudio();
    setSpeechState({ status: "idle" });
  }, [stopCurrentAudio]);

  useEffect(
    () => () => {
      const runtime = runtimeRef.current;
      runtime.requestId += 1;
      if (runtime.request) runtime.request.abort();
      if (runtime.audio) runtime.audio.pause();
    },
    [],
  );

  return { speechState, playSpeech, stopSpeech };
}
