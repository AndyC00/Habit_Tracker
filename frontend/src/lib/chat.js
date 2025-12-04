const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_KEY = process.env.CLOUDFLARE_API_KEY;
const MODEL = "@cf/meta/llama-3-8b-instruct";

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
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

  if (!ACCOUNT_ID || !API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Cloudflare credentials missing" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const habitContext =
      typeof body.habitContext === "string" ? body.habitContext.trim() : "";
    const trimmed = messages
      .map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content.trim() : "",
      }))
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content);

    if (trimmed.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing messages" }),
      };
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${encodeURIComponent(
      MODEL
    )}`;

    const aiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a concise, friendly assistant for a habit tracker app.",
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
    });

    const data = await aiRes.json();

    if (!aiRes.ok) {
      const errorMessage = data?.errors?.[0]?.message || data?.error || "Cloudflare AI request failed";
      throw new Error(errorMessage);
    }

    const reply = data?.result?.response || data?.result?.output_text || data?.result?.message?.content;

    if (!reply) {
      throw new Error("No reply returned from model");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error("Chat function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Unexpected error" }),
    };
  }
};
