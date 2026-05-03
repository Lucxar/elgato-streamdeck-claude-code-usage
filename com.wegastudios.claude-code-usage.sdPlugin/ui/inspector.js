// Property Inspector for the Claude Code Usage tracker action.
//
// Stream Deck calls connectElgatoStreamDeckSocket() once the WebSocket is
// ready. From then on we maintain a live link with the plugin: pushing
// settings on input change, pulling status updates pushed from the plugin.
//
// Vanilla JS — no bundler, no framework. Runs as-is when packed.

"use strict";

(() => {
  const HELP_URL = "https://github.com/Lucxar/elgato-streamdeck-claude-code-usage#readme";
  const CLAUDE_CODE_URL = "https://claude.ai/code";

  let websocket = null;
  let uuid = null;        // The PI's own context UUID — needed for setSettings
  let actionInfo = null;  // Includes the action's manifest UUID + initial settings
  let saveDebounceTimer = null;

  const els = {
    dot: document.getElementById("dot"),
    statusMsg: document.getElementById("status-msg"),
    statusMeta: document.getElementById("status-meta"),
    refreshBtn: document.getElementById("refresh-btn"),
    pathInput: document.getElementById("credentials-path"),
    helpLink: document.getElementById("help-link"),
    claudeCodeLink: document.getElementById("claude-code-link"),
  };

  // Stream Deck calls this with all the wiring we need.
  window.connectElgatoStreamDeckSocket = (port, propertyInspectorUUID, registerEvent, info, actionInfoString) => {
    uuid = propertyInspectorUUID;
    try { actionInfo = JSON.parse(actionInfoString); } catch { actionInfo = null; }

    websocket = new WebSocket(`ws://127.0.0.1:${port}`);
    websocket.onopen = () => {
      websocket.send(JSON.stringify({ event: registerEvent, uuid }));
      // Hydrate UI from initial settings, then ask the plugin for current status.
      const initialSettings = actionInfo?.payload?.settings ?? {};
      hydrateInputs(initialSettings);
      sendToPlugin({ type: "getStatus" });
    };
    websocket.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.event === "sendToPropertyInspector" && data.payload) {
        applyStatus(data.payload);
      } else if (data.event === "didReceiveSettings" && data.payload?.settings) {
        // Settings were updated externally (e.g. by the plugin). Re-hydrate
        // without triggering an echo.
        hydrateInputs(data.payload.settings);
      }
    };
  };

  // ---------- Wiring ----------

  els.refreshBtn.addEventListener("click", () => {
    sendToPlugin({ type: "refresh" });
  });

  // Debounce typed input — only persist after the user pauses for 400ms.
  els.pathInput.addEventListener("input", () => {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(persistSettings, 400);
  });
  els.pathInput.addEventListener("blur", persistSettings);

  els.helpLink.addEventListener("click", (e) => {
    e.preventDefault();
    openUrl(HELP_URL);
  });
  els.claudeCodeLink.addEventListener("click", (e) => {
    e.preventDefault();
    openUrl(CLAUDE_CODE_URL);
  });

  // ---------- Helpers ----------

  function hydrateInputs(settings) {
    if (typeof settings.credentialsPath === "string") {
      els.pathInput.value = settings.credentialsPath;
    } else {
      els.pathInput.value = "";
    }
  }

  function persistSettings() {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    // Preserve other settings the plugin tracks (viewIndex etc) by merging
    // onto the latest known set — Stream Deck overwrites the whole object.
    const current = actionInfo?.payload?.settings ?? {};
    const next = { ...current };
    const trimmed = els.pathInput.value.trim();
    if (trimmed.length > 0) next.credentialsPath = trimmed;
    else delete next.credentialsPath;
    actionInfo.payload.settings = next;

    websocket.send(JSON.stringify({
      event: "setSettings",
      context: uuid,
      payload: next,
    }));
  }

  function sendToPlugin(payload) {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !actionInfo) return;
    websocket.send(JSON.stringify({
      event: "sendToPlugin",
      context: uuid,
      action: actionInfo.action,
      payload,
    }));
  }

  function openUrl(url) {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    websocket.send(JSON.stringify({ event: "openUrl", payload: { url } }));
  }

  function applyStatus(status) {
    const dotClass = {
      ok: "ok",
      loading: "loading",
      "rate-limited": "warn",
      error: "err",
    }[status.kind] ?? "loading";
    els.dot.className = `dot ${dotClass}`;
    els.statusMsg.textContent = status.message ?? "—";

    const metaParts = [];
    if (status.credentialsPath) metaParts.push(`Path: ${status.credentialsPath}`);
    if (status.lastFetchAt) metaParts.push(`Last fetch: ${new Date(status.lastFetchAt).toLocaleTimeString()}`);
    els.statusMeta.textContent = metaParts.join(" · ");
  }
})();
