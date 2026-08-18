import { getFunctionAuthHeaders } from "./auth";

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiRequestType = "chat" | "habit-analysis";

export type AiRequestPayload = {
  messages: AiMessage[];
  habitContext?: string;
  requestType?: AiRequestType;
};

export async function requestAiReply(
  functionsBase: string,
  payload: AiRequestPayload,
): Promise<string> {
  const authHeaders = await getFunctionAuthHeaders();
  const response = await fetch(`${functionsBase}/.netlify/functions/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data: any = null;
  let parseError: Error | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error: any) {
      parseError = error;
    }
  }

  if (!response.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data) : "";
    if (response.status === 404) {
      throw new Error(
        "Chat function not found (404). Are Netlify functions running? Try `netlify dev`.",
      );
    }
    throw new Error(data?.error || `Chat request failed (${response.status}) ${detail}`);
  }

  if (parseError) {
    throw new Error(`Invalid chat response: ${parseError.message || "parse error"}`);
  }

  const reply = data?.reply;
  if (!reply) throw new Error("No reply from assistant.");
  return typeof reply === "string" ? reply : String(reply);
}
