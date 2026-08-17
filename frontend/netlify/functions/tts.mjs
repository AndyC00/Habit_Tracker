import {
  buildCloudflareAuthHeaders,
  fetchWithTimeout,
  getCloudflareAccountId,
} from "./_shared/cloudflare.mjs";
import {
  RequestAuthenticationError,
  requireFirebaseUser,
} from "./_shared/firebaseAuth.mjs";

const MODEL = "inworld/tts-1.5-mini";
const MAX_TEXT_LENGTH = 2000;
const DEFAULT_TIMEOUT_MS = Number(process.env.CF_TTS_TIMEOUT_MS || 25000);

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
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing text" }),
      };
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Text exceeds the 2,000 character limit" }),
      };
    }

    const accountId = getCloudflareAccountId();
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
    const aiRes = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildCloudflareAuthHeaders({ apiTokenOnly: true }),
        },
        body: JSON.stringify({
          model: MODEL,
          input: {
            text,
            voice_id: "Claire",
            output_format: "mp3",
            temperature: 1,
            timestamp_type: "none",
            speaking_rate: 1,
          },
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
        console.error("Failed to parse Cloudflare TTS response:", error);
      }
    }

    const cloudflareResult = data?.result;
    const cloudflareState = data?.state || cloudflareResult?.state;
    const cloudflareError =
      data?.errors?.[0]?.message ||
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : "") ||
      data?.message ||
      cloudflareResult?.errors?.[0]?.message ||
      cloudflareResult?.error?.message ||
      (typeof cloudflareResult?.error === "string" ? cloudflareResult.error : "") ||
      cloudflareResult?.message;

    if (!aiRes.ok) {
      const errorMessage =
        cloudflareError ||
        "Cloudflare TTS request failed";
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: errorMessage, detail: data }),
      };
    }

    const audioUrl = cloudflareResult?.audio || cloudflareResult?.result?.audio;
    if (!audioUrl) {
      console.error("Cloudflare TTS returned no audio:", {
        state: cloudflareState,
        error: cloudflareError,
      });
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error:
            cloudflareError ||
            `Cloudflare TTS returned no audio${cloudflareState ? ` (${cloudflareState})` : ""}.`,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ audioUrl }),
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
    console.error("TTS function error:", error);
    return {
      statusCode: isTimeout ? 504 : 500,
      headers,
      body: JSON.stringify({
        error: isTimeout
          ? "Cloudflare TTS request timed out. Please try again."
          : error.message || "Unexpected error",
      }),
    };
  }
};
