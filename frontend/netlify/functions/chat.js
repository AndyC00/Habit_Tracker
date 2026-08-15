import {
  buildCloudflareAuthHeaders,
  fetchWithTimeout,
  getCloudflareAccountId,
} from "./_shared/cloudflare.js";
import {
  RequestAuthenticationError,
  requireFirebaseUser,
} from "./_shared/firebaseAuth.js";

const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const DEFAULT_TIMEOUT_MS = Number(process.env.CF_AI_TIMEOUT_MS || 25000);

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    await requireFirebaseUser(event);

    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const habitContext =
      typeof body.habitContext === "string" ? body.habitContext.trim() : "";
    const trimmed = messages
      .map((message) => ({
        role: message.role,
        content: typeof message.content === "string" ? message.content.trim() : "",
      }))
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") && message.content,
      );

    if (trimmed.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing messages" }),
      };
    }

    const accountId = getCloudflareAccountId();
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
    const aiRes = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildCloudflareAuthHeaders(),
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a concise, friendly assistant for a habit tracker app. Respond in plain text (no markdown or symbols like **). Keep evaluation short (<=3 sentences) and clear. Provide at most 3 numbered suggestions, each under 20 words.",
            },
            habitContext
              ? {
                  role: "system",
                  content: `Habit context from user:\n${habitContext}`,
                }
              : null,
            ...trimmed,
          ].filter(Boolean),
        }),
      },
      DEFAULT_TIMEOUT_MS,
    );

    const dataText = await aiRes.text();
    let data = null;
    if (dataText) {
      try {
        data = JSON.parse(dataText);
      } catch (error) {
        console.error("Failed to parse Cloudflare AI response:", error);
      }
    }

    if (!aiRes.ok) {
      const errorMessage =
        data?.errors?.[0]?.message ||
        data?.error ||
        data?.message ||
        "Cloudflare AI request failed";

      return {
        statusCode: aiRes.status || 502,
        headers,
        body: JSON.stringify({ error: errorMessage, detail: data }),
      };
    }

    const reply =
      data?.result?.response ||
      data?.result?.output_text ||
      data?.result?.message?.content;

    if (!reply) throw new Error("No reply returned from model");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    if (error instanceof RequestAuthenticationError) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: error.message }),
      };
    }

    const isTimeout = error?.name === "AbortError";
    console.error("Chat function error:", error);
    return {
      statusCode: isTimeout ? 504 : 500,
      headers,
      body: JSON.stringify({
        error: isTimeout
          ? "Cloudflare AI request timed out. Please try again."
          : error.message || "Unexpected error",
      }),
    };
  }
};
