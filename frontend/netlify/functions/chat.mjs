import {
  buildCloudflareAuthHeaders,
  fetchWithTimeout,
  getCloudflareAccountId,
} from "./_shared/cloudflare.mjs";
import {
  RequestAuthenticationError,
  requireFirebaseUser,
} from "./_shared/firebaseAuth.mjs";

const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const DEFAULT_TIMEOUT_MS = Number(process.env.CF_AI_TIMEOUT_MS || 25000);
const CHAT_SYSTEM_PROMPT =
  "You are a concise, friendly assistant for a habit tracker app. " +
  "Providing useful advice based on the habit records and user's local environment info (location, weather and temperature) " +
  "Respond in plain text (no markdown or symbols like **). " +
  "Keep evaluation short (<=5 sentences) and clear. Provide at most 3 numbered suggestions, each under 40 words. ";
const HABIT_ANALYSIS_SYSTEM_PROMPT =
  `You are an expert habit behaviour analyst. Analyse only the supplied habit, check-in, and environment context. Ground every conclusion in the provided data. Do not invent records or present speculation as fact. When evidence is limited or missing, state that clearly and lower the confidence of the relevant conclusion.

Treat the supplied Habit start date, defined as the first real check-in, as the beginning of the observation period. Dates before it are out of scope and must never be classified as missed days. In the daily timeline, "checked in, duration not recorded" means the Habit was completed but its duration is unknown; do not treat it as zero minutes or as a missed day. The weather and temperature describe the current environment only, so do not use them as causes of historical behaviour unless historical environment data is explicitly supplied.

Return a concise plain-text report using exactly these five numbered section headings in this order:

1. Overall Summary of the Habit
Summarise adherence, consistency, duration, recent direction, and performance against the user's expected performance when it is provided. Cite the most relevant figures from the context.

2. Behaviour Anomaly Detection
Identify meaningful post-start deviations, unusual gaps, spikes, drops, streak breaks, or changes in duration. Cite dates and values when available. Respect the difference between missed days and check-ins with unknown duration. If no defensible anomaly can be detected, say so instead of inventing one.

3. Prediction of the Next 7 Days
Provide a Day 1 through Day 7 forecast for likely completion and duration, followed by an overall confidence level and a brief evidence-based rationale. Treat the forecast as probabilistic, not certain.

4. Root Cause / Driver Analysis
Explain the strongest likely positive and negative drivers supported by the habit history, expected performance, and environment. Clearly label hypotheses when causation cannot be established from the supplied data.

5. What-if Simulator (Recommended Actions to Improve Performance)
Recommend up to three specific, practical changes. For each, state the action, the expected effect over the next 7 days, and why the supplied data supports it. Do not claim guaranteed outcomes.

Use short paragraphs and readable plain text. Do not use Markdown tables. Keep the complete report focused and actionable.`;

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
    const requestType = body.requestType ?? "chat";
    if (requestType !== "chat" && requestType !== "habit-analysis") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid request type" }),
      };
    }
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
                requestType === "habit-analysis"
                  ? HABIT_ANALYSIS_SYSTEM_PROMPT
                  : CHAT_SYSTEM_PROMPT,
            },
            habitContext
              ? {
                  role: "system",
                  content: `User context:\n${habitContext}`,
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
