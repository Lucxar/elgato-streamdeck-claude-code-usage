import type { UsageResponse } from "../types.js";

const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";

/**
 * The OAuth-scoped endpoints require this beta header. Identical to what
 * the Claude Code CLI itself sends — drop it and the API returns 401.
 */
const BETA_HEADER = "oauth-2025-04-20";

/** A user-agent that mirrors the Claude CLI; some endpoints reject empty UAs. */
const USER_AGENT = "claude-streamdeck-plugin/0.1 (+local)";

export class UsageApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "UsageApiError";
  }
}

export class UsageUnauthorizedError extends UsageApiError {
  constructor(body?: string) {
    super("Anthropic API returned 401 Unauthorized — token rejected", 401, body);
    this.name = "UsageUnauthorizedError";
  }
}

export class UsageRateLimitedError extends UsageApiError {
  constructor(public readonly retryAfterMs: number, body?: string) {
    super(`Anthropic API returned 429 — retry in ${Math.round(retryAfterMs / 1000)}s`, 429, body);
    this.name = "UsageRateLimitedError";
  }
}

/**
 * GET https://api.anthropic.com/api/oauth/usage with an OAuth bearer token.
 * Returns the parsed JSON typed as UsageResponse. Does NOT validate every
 * field strictly — buckets that don't apply to the user's plan come back as
 * null, and downstream view code handles that.
 */
export async function fetchUsage(accessToken: string, signal?: AbortSignal): Promise<UsageResponse> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "GET",
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": BETA_HEADER,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new UsageApiError(
      `Network error contacting Anthropic API: ${(err as Error).message}`,
      undefined,
      undefined,
    );
  }

  if (res.status === 401 || res.status === 403) {
    const body = await safeReadText(res);
    throw new UsageUnauthorizedError(body);
  }

  if (res.status === 429) {
    const body = await safeReadText(res);
    throw new UsageRateLimitedError(parseRetryAfter(res), body);
  }

  if (!res.ok) {
    const body = await safeReadText(res);
    throw new UsageApiError(`Anthropic API ${res.status} ${res.statusText}`, res.status, body);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new UsageApiError(`Failed to parse Anthropic API response as JSON: ${(err as Error).message}`);
  }

  if (!json || typeof json !== "object") {
    throw new UsageApiError("Anthropic API returned a non-object payload");
  }

  return json as UsageResponse;
}

async function safeReadText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

/**
 * Parses Retry-After per RFC 7231: either delta-seconds or an HTTP-date.
 * Returns ms; falls back to 60s if header is missing or unparseable.
 */
function parseRetryAfter(res: Response): number {
  const header = res.headers.get("retry-after");
  const fallback = 60_000;
  if (!header) return fallback;
  const asNum = Number(header);
  if (Number.isFinite(asNum) && asNum >= 0) return asNum * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return fallback;
}
