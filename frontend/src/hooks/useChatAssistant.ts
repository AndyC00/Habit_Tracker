import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../components/ChatWidget";

export function useChatAssistant(functionsBase: string) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatHistoryRef = useRef<ChatMessage[]>([]);

  const sendChatMessage = useCallback(
    async (messageText: string, habitContext?: string) => {
      if (chatPending) return;
      const text = messageText.trim();
      if (!text) return;

      const userMessage: ChatMessage = { role: "user", content: text };
      const history = [...chatHistoryRef.current, userMessage];
      chatHistoryRef.current = history;

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

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: typeof reply === "string" ? reply : String(reply),
      };

      setChatMessages((prev): ChatMessage[] => {
        const next: ChatMessage[] = [...prev, assistantMessage];
        chatHistoryRef.current = next;
        return next;
      });
      } catch (e: any) {
        setChatError(e.message ?? "Chat failed.");
      } finally {
        setChatPending(false);
      }
    },
    [chatPending, functionsBase],
  );

  return {
    chatOpen,
    setChatOpen,
    chatMessages,
    chatPending,
    chatError,
    chatDraft,
    setChatDraft,
    sendChatMessage,
  };
}
