const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  // When running locally (Netlify dev / npm run dev), try to hydrate process.env from frontend/.env
  const candidates = [
    path.resolve(process.cwd(), "frontend", ".env"), // running from repo root
    path.resolve(process.cwd(), ".env"), // running from frontend folder
  ];

  const target = candidates.find((p) => fs.existsSync(p));
  if (!target) return;

  const lines = fs.readFileSync(target, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rest.join("=").trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Only attempt to load from file when not in production deploys.
if (process.env.NETLIFY_DEV === "true" || process.env.NETLIFY_LOCAL === "true" || process.env.NODE_ENV !== "production") {
  loadLocalEnv();
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;
const API_EMAIL = process.env.CLOUDFLARE_API_EMAIL;
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

  if (!ACCOUNT_ID || !API_TOKEN) {
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

    const normalizedModel = MODEL.startsWith("@") ? MODEL : `@${MODEL}`;
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${normalizedModel}`;

    const headersPayload = {
      "Content-Type": "application/json",
    };

    // Prefer API token (Workers AI token). If unavailable but we have email + global key, fall back.
    if (API_TOKEN && !API_EMAIL) {
      headersPayload.Authorization = `Bearer ${API_TOKEN}`;
    } else if (API_TOKEN && API_EMAIL) {
      headersPayload["X-Auth-Email"] = API_EMAIL;
      headersPayload["X-Auth-Key"] = API_TOKEN;
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Cloudflare authentication not configured" }),
      };
    }

    const aiRes = await fetch(url, {
      method: "POST",
        headers: headersPayload,
        body: JSON.stringify({
          model: normalizedModel,
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
    });

    const data = await aiRes.json();

    if (!aiRes.ok) {
      const errorMessage =
        data?.errors?.[0]?.message ||
        data?.error ||
        data?.message ||
        "Cloudflare AI request failed";

      return {
        statusCode: aiRes.status || 502,
        headers,
        body: JSON.stringify({
          error: errorMessage,
          detail: data,
        }),
      };
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
