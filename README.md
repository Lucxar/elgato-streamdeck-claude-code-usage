# Claude Code Usage — Stream Deck + Plugin

A companion plugin for [Claude Code](https://claude.ai/code) that displays your
subscription usage limits on a Stream Deck + rotary encoder.

> Not affiliated with, endorsed by, or sponsored by Anthropic.
> This plugin reads the OAuth session token Claude Code already stores on
> your machine — it does not perform its own OAuth flow.

## Features

- **Live usage on a dial** — 5-hour rolling limit, weekly limit, Fable 7-day
- **Rotate to switch view** with wrap-around
- **Press or tap to refresh** immediately (rate-limit aware)
- **Auto-refresh** every 90 seconds in the background
- **Custom layout** with the time-until-reset always visible in the title

## Requirements

- Stream Deck + (or Stream Deck + XL) — the action targets rotary encoders
- Stream Deck app version **6.5** or newer
- [Claude Code](https://claude.ai/code) installed and signed in to a paid plan
  (Pro, Max, Team)
- Windows 10+ or macOS 12+

## Installation

### From the Elgato Marketplace (recommended once published)

1. Open the Stream Deck app
2. Browse the Marketplace and install **Claude Code Usage**
3. Drag the **Usage Tracker** action onto a free dial

### From source

```bash
git clone https://github.com/Lucxar/elgato-streamdeck-claude-code-usage
cd streamdeck-claude-code-usage
npm install
npm run build
streamdeck link com.wegastudios.claude-code-usage.sdPlugin
```

Then drag the action onto a dial in the Stream Deck app.

## Usage

| Gesture        | Effect                              |
|----------------|-------------------------------------|
| Rotate dial    | Switch view (5h ↔ Weekly ↔ Fable) |
| Press dial     | Force refresh                       |
| Touch screen   | Force refresh                       |

The dial shows: `<view title> · <time until reset>` on top, the utilization
percentage in the middle, and a progress bar at the bottom.

## Configuration

Right-click the action and choose **Edit** to open the Property Inspector.

- **Status block** — shows whether the plugin can read your credentials and
  reach the Anthropic API
- **Refresh now** button — same as pressing the dial
- **Credentials path** — leave empty to use the default
  (`~/.claude/.credentials.json`). Override only for non-standard installs
  (portable, WSL with mounted home, custom `HOME` env var)

## Troubleshooting

**Dial shows "Claude Code not signed in"**
- Run `claude login` from a terminal, or open Claude Code and sign in
- If your installation is non-standard, set the credentials path in the PI

**Dial shows "Token expired"**
- Open Claude Code — it will refresh the token automatically. The dial picks
  it up on the next 90-second tick (or press the dial to force a refresh).

**Dial shows "Rate limited"**
- Anthropic's usage endpoint is rate-limited. The plugin honours
  `Retry-After` and resumes automatically. Last good values stay on screen
  during the wait.

**The action doesn't appear in the action list**
- The action only registers on devices with rotary encoders. Stream Deck
  Mini, MK.2, and XL (without the +) are not supported.

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: this plugin sends your local
Claude Code OAuth token to Anthropic's API to read your usage data.
Nothing is sent anywhere else. No telemetry, no analytics.

## How it works

1. Reads `~/.claude/.credentials.json` to extract the OAuth access token
   that Claude Code maintains
2. Calls `GET https://api.anthropic.com/api/oauth/usage` with that token
3. Renders the response on the encoder's touchscreen

The endpoint is undocumented and intended for Claude Code's internal use.
Anthropic may change or remove it without notice; if that happens this
plugin will degrade to an "API error" state and need an update.

## License

MIT — see [LICENSE](LICENSE).

Copyright © 2026 Wega Studios.

## Disclaimer

"Claude" and "Claude Code" are trademarks of Anthropic, PBC. This project
is an independent third-party tool and is not affiliated with, endorsed by,
or sponsored by Anthropic.
