import streamDeck, {
  action,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type DidReceiveSettingsEvent,
  type FeedbackPayload,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { UsageService, type UsageState } from "../services/usage-service.js";
import {
  buildErrorView,
  buildLoadingView,
  buildOkView,
  type ViewPayload,
  rotateIndex,
} from "../ui/views.js";
import type { ActionSettings } from "../types.js";

/**
 * Per-instance bookkeeping. We hold the live `DialAction` reference (used to
 * call setFeedback/setSettings), the dial's current view index, and the
 * UsageService unsubscribe handle so we can detach on disappear.
 */
type Instance = {
  action: DialAction<ActionSettings>;
  viewIndex: number;
  credentialsPath: string | null;
  unsubscribe: () => void;
};

/** Messages the Property Inspector can send to the plugin. */
type PIMessage =
  | { type: "refresh" }
  | { type: "getStatus" };

@action({ UUID: "com.wegastudios.claude-code-usage.tracker" })
export class ClaudeUsageTracker extends SingletonAction<ActionSettings> {
  /** Keyed by Stream Deck action id (one per dial instance). */
  private readonly instances = new Map<string, Instance>();

  override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
    if (!ev.action.isDial()) return;

    const dial = ev.action;
    const settings = ev.payload.settings;
    const initialIndex = clampIndex(settings.viewIndex ?? 0);
    const credentialsPath = normalizePath(settings.credentialsPath);

    await dial.setFeedback(payloadToFeedback(buildLoadingView(initialIndex)));

    const unsubscribe = UsageService.subscribe((state) => {
      const inst = this.instances.get(dial.id);
      if (!inst) return;
      void renderState(inst.action, inst.viewIndex, state);
      // Mirror state to the PI if it's currently open.
      pushStatusToPi();
    }, credentialsPath);

    this.instances.set(dial.id, {
      action: dial,
      viewIndex: initialIndex,
      credentialsPath,
      unsubscribe,
    });
  }

  override onWillDisappear(ev: WillDisappearEvent<ActionSettings>): void {
    const inst = this.instances.get(ev.action.id);
    if (!inst) return;
    inst.unsubscribe();
    this.instances.delete(ev.action.id);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ActionSettings>,
  ): Promise<void> {
    const inst = this.instances.get(ev.action.id);
    if (!inst) return;

    const nextIndex = clampIndex(ev.payload.settings.viewIndex ?? inst.viewIndex);
    const nextPath = normalizePath(ev.payload.settings.credentialsPath);

    // If the credentials path changed, re-subscribe so the service picks up
    // the new path on the next polling cycle.
    if (nextPath !== inst.credentialsPath) {
      inst.unsubscribe();
      inst.credentialsPath = nextPath;
      inst.unsubscribe = UsageService.subscribe((state) => {
        const i = this.instances.get(ev.action.id);
        if (!i) return;
        void renderState(i.action, i.viewIndex, state);
        pushStatusToPi();
      }, nextPath);
      // Force an immediate refresh against the new path.
      await UsageService.forceRefresh();
    }

    if (nextIndex !== inst.viewIndex) {
      inst.viewIndex = nextIndex;
      await renderCurrent(inst);
    }
  }

  override async onDialRotate(ev: DialRotateEvent<ActionSettings>): Promise<void> {
    const inst = this.instances.get(ev.action.id);
    if (!inst) return;

    const direction = Math.sign(ev.payload.ticks) || 0;
    if (direction === 0) return;

    inst.viewIndex = rotateIndex(inst.viewIndex, direction);
    await inst.action.setSettings({
      ...ev.payload.settings,
      viewIndex: inst.viewIndex,
    });
    await renderCurrent(inst);
  }

  override async onDialDown(ev: DialDownEvent<ActionSettings>): Promise<void> {
    await this.handleManualRefresh(ev.action.id);
  }

  override async onTouchTap(ev: TouchTapEvent<ActionSettings>): Promise<void> {
    await this.handleManualRefresh(ev.action.id);
  }

  /** Push initial status when the PI opens so it doesn't show a blank state. */
  override onPropertyInspectorDidAppear(
    _ev: PropertyInspectorDidAppearEvent<ActionSettings>,
  ): void {
    pushStatusToPi();
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<JsonValue, ActionSettings>,
  ): Promise<void> {
    const msg = ev.payload as Partial<PIMessage>;
    switch (msg.type) {
      case "refresh":
        await UsageService.forceRefresh();
        pushStatusToPi();
        return;
      case "getStatus":
        pushStatusToPi();
        return;
    }
  }

  private async handleManualRefresh(actionId: string): Promise<void> {
    const inst = this.instances.get(actionId);
    if (!inst) return;
    await inst.action.setFeedback(payloadToFeedback({
      title: "Refreshing",
      value: "…",
      indicator: 0,
    }));
    await UsageService.forceRefresh();
    await renderCurrent(inst);
    pushStatusToPi();
  }
}

function clampIndex(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return rotateIndex(0, Math.trunc(n));
}

function normalizePath(p: string | undefined): string | null {
  if (typeof p !== "string") return null;
  const trimmed = p.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function renderCurrent(inst: Instance): Promise<void> {
  await renderState(inst.action, inst.viewIndex, UsageService.getState());
}

async function renderState(
  dial: DialAction<ActionSettings>,
  viewIndex: number,
  state: UsageState,
): Promise<void> {
  let payload: ViewPayload;
  switch (state.kind) {
    case "loading":
      payload = buildLoadingView(viewIndex);
      break;
    case "ok":
      payload = buildOkView(state.snapshot.response, viewIndex);
      break;
    case "error":
      payload = state.lastSnapshot
        ? buildOkView(state.lastSnapshot.response, viewIndex)
        : buildErrorView(state.error, viewIndex);
      break;
  }
  try {
    await dial.setFeedback(payloadToFeedback(payload));
  } catch (err) {
    streamDeck.logger.warn(`setFeedback failed for ${dial.id}: ${(err as Error).message}`);
  }
}

/**
 * Push the current service status to whichever PI is open. The SDK's
 * `streamDeck.ui.sendToPropertyInspector()` is a no-op if no PI is visible,
 * so we don't need a guard. Wrapped in try/catch so a transport failure
 * can't break a dial render.
 */
function pushStatusToPi(): void {
  try {
    void streamDeck.ui.sendToPropertyInspector(
      UsageService.getStatus() as unknown as JsonValue,
    );
  } catch (err) {
    streamDeck.logger.debug(`sendToPropertyInspector failed: ${(err as Error).message}`);
  }
}

/**
 * Adapts our pure-data payload to the SDK's FeedbackPayload shape for the
 * custom layout (title + value + bar). The `indicator` key takes a numeric
 * shorthand which Stream Deck maps to bar.value.
 */
function payloadToFeedback(p: ViewPayload): FeedbackPayload {
  return {
    title: p.title,
    value: p.value,
    indicator: p.indicator,
  };
}
