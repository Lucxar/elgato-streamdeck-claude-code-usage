/**
 * Shape of a single usage bucket as returned by GET /api/oauth/usage.
 * The API returns null for buckets that don't apply to the user's plan
 * (e.g. seven_day_opus is null on Max-without-Opus accounts).
 */
export type UsageBucket = {
  utilization: number;
  /** ISO 8601, or null — observed even on present windows (e.g. 0% util). */
  resets_at: string | null;
};

/**
 * One entry of the `limits` array Anthropic added to the response in mid-2026.
 * Account-wide windows are restated here (`kind: "session"` mirrors
 * `five_hour`, `kind: "weekly_all"` mirrors `seven_day`); model-scoped limits
 * (e.g. Fable's weekly cap) exist ONLY here — there is no flat
 * `seven_day_fable` field. All fields defensive-optional: the endpoint is
 * undocumented and shifts without notice.
 */
export type UsageLimit = {
  kind?: string | null;
  group?: string | null;
  /** Utilization 0–100. Same unit as UsageBucket.utilization. */
  percent?: number | null;
  severity?: string | null;
  resets_at?: string | null;
  /** null for account-wide limits; model-scoped entries carry the model name. */
  scope?: {
    model?: { id?: string | null; display_name?: string | null } | null;
    surface?: unknown;
  } | null;
  is_active?: boolean;
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
  /** Model-scoped limits live here since mid-2026 (see UsageLimit). */
  limits?: UsageLimit[] | null;
  /**
   * Speculative flat field for the Fable weekly cap. Not observed in the wild
   * (2026-07: Fable exists only inside `limits`), but some third-party clients
   * probe it — kept as a cheap fallback should Anthropic flatten it later.
   */
  seven_day_fable?: UsageBucket | null;
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


/** Identifiers for the three fixed views the dial cycles through. */
export type ViewId = "five_hour" | "seven_day" | "fable";

export const VIEW_ORDER: readonly ViewId[] = [
  "five_hour",
  "seven_day",
  "fable",
] as const;
