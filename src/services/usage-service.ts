import streamDeck from "@elgato/streamdeck";

import {
  CredentialsMissingError,
  CredentialsParseError,
  TokenExpiredError,
  getCredentialsPath,
  readCredentials,
} from "./credentials.js";
import { UsageRateLimitedError, UsageUnauthorizedError, fetchUsage } from "./usage-api.js";
import type { StatusUpdate, UsageSnapshot } from "../types.js";

/**
 * Polling interval. The Anthropic usage endpoint rate-limits aggressively —
 * empirically ~5 requests/minute trips 429. 90s gives us 40 req/hour with
 * headroom for occasional force-refreshes; if we do hit a 429, the backoff
 * logic below silently waits it out instead of surfacing an error.
 */
const POLL_MS = 90_000;

/** Minimum gap between successive force-refreshes; prevents dial-spam. */
const MIN_REFRESH_MS = 15_000;

export type UsageState =
  | { kind: "loading" }
  | { kind: "ok"; snapshot: UsageSnapshot }
  | { kind: "error"; error: Error; lastSnapshot: UsageSnapshot | null };

type Subscriber = (state: UsageState) => void;

/**
 * Singleton that owns:
 *   - the polling interval,
 *   - the latest usage snapshot,
 *   - the subscriber list (one entry per visible action instance).
 *
 * Multiple Stream Deck profiles can have the action placed on different dials
 * — one shared timer fans out to all subscribers instead of N independent
 * timers each burning rate budget.
 *
 * For per-action `credentialsPath` overrides (MVP simplification): the path
 * from the *first* subscriber wins. Conflicting paths from later subscribers
 * are logged but ignored. Multi-account support is out of scope for v1.
 */
class UsageServiceImpl {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: AbortController | null = null;
  private subscribers = new Set<Subscriber>();
  private lastFetchAt = 0;
  /** Earliest timestamp at which the next fetch may run (set by 429 backoff). */
  private nextAllowedAt = 0;
  /** The credentials path the singleton is currently locked to. */
  private credentialsPath: string | null = null;

  private state: UsageState = { kind: "loading" };

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(cb: Subscriber, credentialsPath?: string | null): () => void {
    if (this.credentialsPath === null) {
      this.credentialsPath = getCredentialsPath(credentialsPath);
    } else {
      const requested = getCredentialsPath(credentialsPath);
      if (requested !== this.credentialsPath) {
        streamDeck.logger.warn(
          `UsageService: ignoring credentialsPath '${requested}' — already locked to '${this.credentialsPath}'`,
        );
      }
    }

    this.subscribers.add(cb);
    cb(this.state);
    this.ensurePolling();
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) {
        this.stopPolling();
        // Reset path lock so the next willAppear can pick a fresh override.
        this.credentialsPath = null;
      }
    };
  }

  /** Manual refresh (dial press / touch). Coalesces and respects 429 backoff. */
  async forceRefresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFetchAt < MIN_REFRESH_MS) return;
    if (now < this.nextAllowedAt) return;
    await this.runFetch();
  }

  /** Read-only access to the most recent state — used for manual re-renders. */
  getState(): UsageState {
    return this.state;
  }

  /** Snapshot of the service's status — sent to the Property Inspector. */
  getStatus(): StatusUpdate {
    const path = this.credentialsPath ?? getCredentialsPath();
    const lastFetchAt = this.lastFetchAt > 0 ? this.lastFetchAt : null;
    const nextAllowedAt = this.nextAllowedAt > Date.now() ? this.nextAllowedAt : null;

    if (nextAllowedAt !== null) {
      const secs = Math.ceil((nextAllowedAt - Date.now()) / 1000);
      return {
        kind: "rate-limited",
        message: `Rate limited — retrying in ${secs}s`,
        credentialsPath: path,
        lastFetchAt,
        nextAllowedAt,
      };
    }

    switch (this.state.kind) {
      case "loading":
        return {
          kind: "loading",
          message: "Loading…",
          credentialsPath: path,
          lastFetchAt,
          nextAllowedAt: null,
        };
      case "ok":
        return {
          kind: "ok",
          message: `Connected — last refresh ${formatAgo(this.state.snapshot.fetchedAt)}`,
          credentialsPath: path,
          lastFetchAt,
          nextAllowedAt: null,
        };
      case "error":
        return {
          kind: "error",
          message: friendlyErrorMessage(this.state.error),
          credentialsPath: path,
          lastFetchAt,
          nextAllowedAt: null,
        };
    }
  }

  private ensurePolling(): void {
    if (this.timer !== null) return;
    void this.runFetch();
    this.timer = setInterval(() => void this.runFetch(), POLL_MS);
    this.timer.unref?.();
  }

  private stopPolling(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.inFlight?.abort();
    this.inFlight = null;
  }

  private async runFetch(): Promise<void> {
    if (Date.now() < this.nextAllowedAt) return;

    this.inFlight?.abort();
    const ctl = new AbortController();
    this.inFlight = ctl;
    this.lastFetchAt = Date.now();

    try {
      const creds = await readCredentials(this.credentialsPath);
      const response = await fetchUsage(creds.accessToken, ctl.signal);
      if (ctl.signal.aborted) return;
      this.nextAllowedAt = 0;
      this.setState({
        kind: "ok",
        snapshot: { response, fetchedAt: Date.now() },
      });
    } catch (err) {
      if (ctl.signal.aborted) return;

      if (err instanceof UsageRateLimitedError) {
        const wait = Math.max(err.retryAfterMs, 5_000);
        this.nextAllowedAt = Date.now() + wait;
        streamDeck.logger.warn(`UsageService: rate limited, backing off ${Math.round(wait / 1000)}s`);
        const recovery = setTimeout(() => void this.runFetch(), wait + 250);
        recovery.unref?.();
        return;
      }

      const previous = this.state.kind === "ok" ? this.state.snapshot : null;
      this.setState({
        kind: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        lastSnapshot: previous ?? (this.state.kind === "error" ? this.state.lastSnapshot : null),
      });
    } finally {
      if (this.inFlight === ctl) this.inFlight = null;
    }
  }

  private setState(next: UsageState): void {
    this.state = next;
    for (const cb of this.subscribers) {
      try {
        cb(next);
      } catch {
        // A misbehaving subscriber must not break the others or the polling loop.
      }
    }
  }
}

function formatAgo(then: number): string {
  const ms = Date.now() - then;
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
  return `${Math.round(ms / 60_000)} min ago`;
}

function friendlyErrorMessage(err: Error): string {
  if (err instanceof CredentialsMissingError) return "Claude Code not signed in";
  if (err instanceof TokenExpiredError) return "Token expired — open Claude Code to refresh";
  if (err instanceof CredentialsParseError) return "Could not read credentials file";
  if (err instanceof UsageUnauthorizedError) return "Token rejected by Anthropic API";
  return `API error: ${err.message}`;
}

export const UsageService = new UsageServiceImpl();
