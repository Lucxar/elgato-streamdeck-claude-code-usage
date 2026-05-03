# Privacy Policy — Claude Code Usage

_Last updated: 2026-05-03_

## What this plugin does with your data

This plugin reads **one file** on your local machine and sends data to
**one external service**:

- **Reads:** `~/.claude/.credentials.json` (or a custom path you configure
  in the Property Inspector). This file is created and maintained by
  [Claude Code](https://claude.ai/code). The plugin extracts the OAuth
  `accessToken` from it.
- **Sends:** an HTTPS request to `https://api.anthropic.com/api/oauth/usage`
  with `Authorization: Bearer <your access token>`. The response (your
  usage percentages and reset times) is displayed on your Stream Deck +
  dial and immediately discarded.

## What this plugin does **not** do

- ❌ Does not transmit your access token, usage data, or any other
  information to any third party
- ❌ Does not run analytics, telemetry, crash reporting, or A/B testing
- ❌ Does not phone home for update checks (the Stream Deck app handles
  updates from the Marketplace)
- ❌ Does not write or modify your `.credentials.json` file
- ❌ Does not collect personally identifiable information

## Data retention

- Your access token is held only in memory during plugin runtime
- The most recent usage snapshot is held only in memory
- Stream Deck persists your **action settings** (selected view, optional
  custom credentials path) per its own platform mechanisms — see
  [Elgato's privacy policy](https://www.elgato.com/privacy)

## Logs

The plugin writes diagnostic logs to its plugin folder under
`logs/`. These logs may include error messages and the path to your
credentials file (never the token itself). Logs are local only.

## Your rights

- You can stop the plugin at any time by removing the action from your
  Stream Deck or uninstalling the plugin
- You can rotate the underlying access token at any time by signing out
  of Claude Code; the plugin will then surface a "Token expired" status

## Contact

For questions about this policy, open an issue at
https://github.com/Lucxar/elgato-streamdeck-claude-code-usage/issues.

---

This policy covers only this plugin's behaviour. Anthropic's handling of
data sent to their API is governed by their own
[privacy policy](https://www.anthropic.com/privacy) and
[API terms](https://www.anthropic.com/legal/api).
