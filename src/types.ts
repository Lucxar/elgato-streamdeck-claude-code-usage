/**
 * Shape of a single usage bucket as returned by GET /api/oauth/usage.
 * The API returns null for buckets that don't apply to the user's plan
 * (e.g. seven_day_opus is null on Max-without-Opus accounts).
 */
export type UsageBucket = {
  utilization: number;
  resets_at: string;
};

/**
 * Full response shape from GET https://api.anthropic.com/api/oauth/usage.
 * Field names mirror the wire format exactly so the parser is the identity
 * function on success — only validation is done.
 */
export type UsageResponse = {
  five_hour: UsageBucket | null;
  seven_day: UsageBucket | null;
  seven_day_oauth_apps: UsageBucket | null;
  seven_day_opus: UsageBucket | null;
  seven_day_sonnet: UsageBucket | null;
  seven_day_cowork: UsageBucket | null;
  seven_day_omelette: UsageBucket | null;
  tangelo: UsageBucket | null;
  iguana_necktie: UsageBucket | null;
  omelette_promotional: UsageBucket | null;
  extra_usage: {
    is_enabled: boolean;
    monthly_limit: number | null;
    used_credits: number | null;
    utilization: number | null;
    currency: string | null;
  };
};

/** Snapshot stored in memory by UsageService — wire response + fetch timestamp. */
export type UsageSnapshot = {
  response: UsageResponse;
  fetchedAt: number;
};

/** State the action persists per-instance via Stream Deck settings. */
export type ActionSettings = {
  viewIndex?: number;
  /**
   * Optional override for the path to Claude Code's `.credentials.json`.
   * Empty/undefined → use the default location (`$HOME/.claude/.credentials.json`).
   * Set via the Property Inspector for users with non-standard installs.
   */
  credentialsPath?: string;
};

/** Shape of the status payload sent to the Property Inspector. */
export type StatusUpdate = {
  kind: "loading" | "ok" | "error" | "rate-limited";
  /** Human-readable one-line message for the PI status block. */
  message: string;
  /** Effective credentials path being used (resolved override or default). */
  credentialsPath: string;
  /** ms since epoch of last successful fetch, or null if none yet. */
  lastFetchAt: number | null;
  /** ms since epoch when the next fetch is allowed (during 429 backoff), or null. */
  nextAllowedAt: number | null;
};


/** Identifiers for the four fixed views the dial cycles through. */
export type ViewId = "five_hour" | "seven_day" | "sonnet" | "opus";

export const VIEW_ORDER: readonly ViewId[] = [
  "five_hour",
  "seven_day",
  "sonnet",
  "opus",
] as const;
