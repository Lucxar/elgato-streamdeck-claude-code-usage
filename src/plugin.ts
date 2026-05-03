import streamDeck from "@elgato/streamdeck";

import { ClaudeUsageTracker } from "./actions/tracker.js";

// Release builds log at "info"; opt into verbose logging via env var when
// debugging from a local link/restart cycle.
const debug = process.env.CLAUDE_USAGE_DEBUG === "1";
streamDeck.logger.setLevel(debug ? "debug" : "info");

streamDeck.actions.registerAction(new ClaudeUsageTracker());

streamDeck.connect();
