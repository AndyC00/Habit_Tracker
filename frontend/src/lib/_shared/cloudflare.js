const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  const candidates = [
    path.resolve(process.cwd(), "frontend", ".env"),
    path.resolve(process.cwd(), ".env"),
  ];
  const target = candidates.find((candidate) => fs.existsSync(candidate));

  if (!target) return;

  const lines = fs.readFileSync(target, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rest.join("=").trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

if (
  process.env.NETLIFY_DEV === "true" ||
  process.env.NETLIFY_LOCAL === "true" ||
  process.env.NODE_ENV !== "production"
) {
  loadLocalEnv();
}

function getCloudflareAccountId() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("Cloudflare account ID missing. Set CLOUDFLARE_ACCOUNT_ID.");
  return accountId;
}

function buildCloudflareAuthHeaders(options = {}) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (apiToken) return { Authorization: `Bearer ${apiToken}` };

  if (!options.apiTokenOnly) {
    const apiKey = process.env.CLOUDFLARE_API_KEY;
    const apiEmail = process.env.CLOUDFLARE_API_EMAIL;
    if (apiKey && apiEmail) {
      return {
        "X-Auth-Email": apiEmail,
        "X-Auth-Key": apiKey,
      };
    }
  }

  throw new Error(
    options.apiTokenOnly
      ? "Cloudflare API token missing. Set CLOUDFLARE_API_TOKEN."
      : "Cloudflare auth missing. Set CLOUDFLARE_API_TOKEN, or set both CLOUDFLARE_API_KEY and CLOUDFLARE_API_EMAIL.",
  );
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
}

module.exports = {
  buildCloudflareAuthHeaders,
  fetchWithTimeout,
  getCloudflareAccountId,
};
