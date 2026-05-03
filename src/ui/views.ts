import {
  CredentialsMissingError,
  CredentialsParseError,
  TokenExpiredError,
} from "../services/credentials.js";
import { UsageUnauthorizedError } from "../services/usage-api.js";
import type { UsageBucket, UsageResponse, ViewId } from "../types.js";
import { VIEW_ORDER } from "../types.js";

/**
 * Pure-data payload for the built-in $B1 layout (title + value + bar).
 *   - title:     top label              ("5H Limit", "Weekly", ...)
 *   - value:     large primary text     ("12%  4h12m", "Loading…")
 *   - indicator: 0..100 progress bar    (utilization)
 *
 * Renamed from "FeedbackPayload" to avoid colliding with the SDK's own type
 * exported under the same name. The action layer adapts this to the SDK shape.
 */
export type ViewPayload = {
  title: string;
  value: string;
  indicator: number;
};

export type ViewMeta = {
  id: ViewId;
  title: string;
  /** Bucket extractor — takes the API response and returns the relevant bucket or null. */
  pick: (r: UsageResponse) => UsageBucket | null;
};

const VIEW_META: Record<ViewId, ViewMeta> = {
  five_hour: {
    id: "five_hour",
    title: "5H Limit",
    pick: (r) => r.five_hour,
  },
  seven_day: {
    id: "seven_day",
    title: "Weekly",
    pick: (r) => r.seven_day,
  },
  sonnet: {
    id: "sonnet",
    title: "Sonnet 7d",
    pick: (r) => r.seven_day_sonnet,
  },
  opus: {
    id: "opus",
    title: "Opus 7d",
    pick: (r) => r.seven_day_opus,
  },
};

/** Wrap-around index arithmetic for dial rotation. */
export function rotateIndex(current: number, ticks: number): number {
  const len = VIEW_ORDER.length;
  // ((x % len) + len) % len handles negative ticks correctly.
  return ((current + ticks) % len + len) % len;
}

export function viewIdAt(index: number): ViewId {
  const len = VIEW_ORDER.length;
  const i = ((index % len) + len) % len;
  // Safe by construction: i is always in [0, len).
  return VIEW_ORDER[i] as ViewId;
}

/** Build the feedback payload for a successful snapshot. */
export function buildOkView(response: UsageResponse, viewIndex: number): ViewPayload {
  const id = viewIdAt(viewIndex);
  const meta = VIEW_META[id];
  const bucket = meta.pick(response);

  if (bucket === null) {
    return {
      title: meta.title,
      value: "n/a",
      indicator: 0,
    };
  }

  const pct = clampPct(bucket.utilization);
  const reset = formatResetSuffix(bucket.resets_at, id);
  // Reset time goes in the title (full-width, no icon competing for space)
  // so it's always visible — even for "1d 23h" weekly values. The value field
  // gets the big, single-glance number.
  return {
    title: reset ? `${meta.title} · ${reset}` : meta.title,
    value: `${pct}%`,
    indicator: pct,
  };
}

/** Build a payload for an error state — keeps the dial usable, surfaces the cause. */
export function buildErrorView(error: Error, viewIndex: number): ViewPayload {
  const id = viewIdAt(viewIndex);
  const title = VIEW_META[id].title;

  if (error instanceof CredentialsMissingError) {
    return { title, value: "No creds", indicator: 0 };
  }
  if (error instanceof TokenExpiredError) {
    return { title, value: "Token exp.", indicator: 0 };
  }
  if (error instanceof CredentialsParseError) {
    return { title, value: "Bad creds", indicator: 0 };
  }
  if (error instanceof UsageUnauthorizedError) {
    return { title, value: "Auth fail", indicator: 0 };
  }
  return { title, value: "API error", indicator: 0 };
}

/** Loading state shown before the first fetch resolves. */
export function buildLoadingView(viewIndex: number): ViewPayload {
  return {
    title: VIEW_META[viewIdAt(viewIndex)].title,
    value: "Loading…",
    indicator: 0,
  };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Renders the reset timestamp as a short suffix ("5h12m", "2d", "now").
 * Empty string if the date is unparseable.
 */
function formatResetSuffix(iso: string, id: ViewId): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const ms = t - Date.now();
  if (ms <= 0) return "now";

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (id === "five_hour") {
    // Always show H+M for the rolling 5-hour window.
    const h = hours;
    const m = minutes - h * 60;
    return `${h}h${m.toString().padStart(2, "0")}m`;
  }

  // Weekly / per-model: show days+hours when >24h (e.g. "1d 23h"), else hours+minutes.
  if (days >= 1) {
    const remH = hours - days * 24;
    return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
  }
  if (hours >= 1) {
    const m = minutes - hours * 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
