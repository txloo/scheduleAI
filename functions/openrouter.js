const logger = require("firebase-functions/logger");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 60000;
const OPENROUTER_MAX_RETRIES_DEFAULT = 5;
const RETRY_BACKOFF_MS_DEFAULT = 2000;
const RETRY_CAP_MS = 30000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRouterChat(apiKey, body) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": "https://pokoro-ai.com",
    "X-OpenRouter-Title": "Schedule AI",
  };
  const configured = parseInt(process.env.OPENROUTER_MAX_RETRIES, 10);
  const maxRetries = Number.isFinite(configured) && configured >= 0
    ? configured
    : OPENROUTER_MAX_RETRIES_DEFAULT;

  let response;
  for (let retryCount = 0; ; retryCount++) {
    logger.info("OpenRouter request", {url: OPENROUTER_API_URL, headers, body, attempt: retryCount + 1});
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });

    // Retry transient rate limits (429) up to OPENROUTER_MAX_RETRIES with backoff.
    if (response.status !== 429 || retryCount >= maxRetries) break;

    const retryAfterSec = parseFloat(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec >= 0
      ? Math.min(Math.ceil(retryAfterSec * 1000), RETRY_CAP_MS)
      : RETRY_BACKOFF_MS_DEFAULT;
    logger.warn(`OpenRouter rate limited (429); retrying in ${waitMs}ms (retry ${retryCount + 1}/${maxRetries})`);
    await delay(waitMs);
  }
  return response;
}

module.exports = {openRouterChat, OPENROUTER_API_URL, OPENROUTER_TIMEOUT_MS, OPENROUTER_MAX_RETRIES_DEFAULT};