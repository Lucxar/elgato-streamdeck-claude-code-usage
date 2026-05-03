import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, normalize } from "node:path";

/** Bearer token + metadata extracted from ~/.claude/.credentials.json. */
export type ClaudeCredentials = {
  accessToken: string;
  /** Unix epoch in milliseconds. */
  expiresAt: number;
  refreshToken: string | null;
  subscriptionType: string | null;
};

export class CredentialsMissingError extends Error {
  constructor(public readonly path: string, cause?: unknown) {
    super(
      `Claude Code credentials not found at ${path}. ` +
      `Install Claude Code (https://claude.ai/code) and sign in, ` +
      `or set a custom path in the action's Property Inspector.`,
    );
    this.name = "CredentialsMissingError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export class CredentialsParseError extends Error {
  constructor(public readonly path: string, cause?: unknown) {
    super(`Claude credentials file at ${path} is not valid JSON or has an unexpected shape`);
    this.name = "CredentialsParseError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export class TokenExpiredError extends Error {
  constructor(public readonly expiresAt: number) {
    super(`Claude OAuth token expired at ${new Date(expiresAt).toISOString()}`);
    this.name = "TokenExpiredError";
  }
}

/**
 * Returns the path to the Claude Code credentials file.
 *  - With override: returns the override (after path normalization).
 *  - Without:       $HOME/.claude/.credentials.json on all platforms
 *                   (homedir() resolves to USERPROFILE on Windows).
 */
export function getCredentialsPath(override?: string | null): string {
  if (override && override.trim().length > 0) return normalize(override.trim());
  return join(homedir(), ".claude", ".credentials.json");
}

/**
 * Reads and validates the Claude credentials file.
 * Throws CredentialsMissingError, CredentialsParseError, or TokenExpiredError
 * — all of which are surfaced to the user as a friendly error view.
 */
export async function readCredentials(override?: string | null): Promise<ClaudeCredentials> {
  const path = getCredentialsPath(override);

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new CredentialsMissingError(path, err);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CredentialsParseError(path, err);
  }

  const oauth = (parsed as { claudeAiOauth?: unknown })?.claudeAiOauth;
  if (
    !oauth ||
    typeof oauth !== "object" ||
    typeof (oauth as { accessToken?: unknown }).accessToken !== "string" ||
    typeof (oauth as { expiresAt?: unknown }).expiresAt !== "number"
  ) {
    throw new CredentialsParseError(path);
  }

  const o = oauth as {
    accessToken: string;
    expiresAt: number;
    refreshToken?: unknown;
    subscriptionType?: unknown;
  };

  if (o.expiresAt <= Date.now()) {
    throw new TokenExpiredError(o.expiresAt);
  }

  return {
    accessToken: o.accessToken,
    expiresAt: o.expiresAt,
    refreshToken: typeof o.refreshToken === "string" ? o.refreshToken : null,
    subscriptionType: typeof o.subscriptionType === "string" ? o.subscriptionType : null,
  };
}
