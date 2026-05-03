// End-to-end smoke test that exercises the credentials reader, API client, and
// view builder against the live Anthropic API + the user's local credentials.
// Run with: node scripts/smoke-test.mjs
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const path = join(homedir(), ".claude", ".credentials.json");
const raw = await readFile(path, "utf-8");
const creds = JSON.parse(raw).claudeAiOauth;
console.log("[creds] expiresAt:", new Date(creds.expiresAt).toISOString());
console.log("[creds] valid for", Math.round((creds.expiresAt - Date.now()) / 3600_000), "hours");

const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
  headers: {
    Authorization: `Bearer ${creds.accessToken}`,
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": "claude-streamdeck-plugin/0.1 (+local)",
    Accept: "application/json",
  },
});
console.log("[api] status:", res.status);
const body = await res.json();

// Mirror views.ts logic exactly.
const VIEW_ORDER = ["five_hour", "seven_day", "sonnet", "opus"];
const VIEW_META = {
  five_hour: { title: "5H Limit", pick: (r) => r.five_hour },
  seven_day: { title: "Weekly", pick: (r) => r.seven_day },
  sonnet:    { title: "Sonnet 7d", pick: (r) => r.seven_day_sonnet },
  opus:      { title: "Opus 7d", pick: (r) => r.seven_day_opus },
};
function fmtSuffix(iso, id) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const ms = t - Date.now();
  if (ms <= 0) return "now";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (id === "five_hour") {
    const m = minutes - hours * 60;
    return `${hours}h${String(m).padStart(2, "0")}m`;
  }
  if (days >= 1) return `${days}d`;
  if (hours >= 1) return `${hours}h`;
  return `${minutes}m`;
}
console.log("\n[views]");
for (const id of VIEW_ORDER) {
  const meta = VIEW_META[id];
  const bucket = meta.pick(body);
  if (!bucket) {
    console.log(`  ${meta.title.padEnd(10)}: n/a (bucket null)`);
    continue;
  }
  const pct = Math.round(bucket.utilization);
  console.log(`  ${meta.title.padEnd(10)}: ${pct}%  resets in ${fmtSuffix(bucket.resets_at, id)} (${bucket.resets_at})`);
}
console.log("\nOK");
