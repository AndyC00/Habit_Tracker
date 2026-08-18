import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../components/ChatWidget";
import { requestAiReply } from "../lib/chatApi";
import { useChatSpeech } from "./useChatSpeech";
import { useChatVoiceInput } from "./useChatVoiceInput";

function buildRequestContext(ambientContext: string, habitContext?: string) {
  const environment = ambientContext.trim();
  const habit = habitContext?.trim();
  return habit ? `${environment}\n\nHabit information:\n${habit}` : environment;
}

export function useChatAssistant(functionsBase: string, ambientContext: string) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const { speechState, playSpeech, stopSpeech } = useChatSpeech(functionsBase);

  const sendChatMessage = useCallback(
    async (messageText: string, habitContext?: string) => {
      if (chatPending) return;
      const text = messageText.trim();
      if (!text) return;

      const userMessage: ChatMessage = { role: "user", content: text };
      const history = [...chatHistoryRef.current, userMessage];
      const requestContext = buildRequestContext(ambientContext, habitContext);
      chatHistoryRef.current = history;

      setChatDraft("");
      setChatError(null);
      setChatMessages(history);
      setChatPending(true);
      setChatOpen(true);

      try {
        const reply = await requestAiReply(functionsBase, {
          requestType: "chat",
          messages: history,
          habitContext: requestContext,
        });

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: reply,
        };

        setChatMessages((prev): ChatMessage[] => {
          const next: ChatMessage[] = [...prev, assistantMessage];
          chatHistoryRef.current = next;
          return next;
        });
        playSpeech(history.length, assistantMessage.content);
      } catch (e: any) {
        setChatError(e.message ?? "Chat failed.");
      } finally {
        setChatPending(false);
      }
    },
    [ambientContext, chatPending, functionsBase, playSpeech],
  );

  const {
    voiceInputState,
    startVoiceInput,
    finishVoiceInput,
    cancelVoiceInput,
  } = useChatVoiceInput({
    disabled: chatPending,
    onSubmit: sendChatMessage,
  });

  return {
    chatOpen,
    setChatOpen,
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
  };
}
