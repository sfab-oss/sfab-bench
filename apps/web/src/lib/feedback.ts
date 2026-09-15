/** Connection up/down, silent-failure dedupe, hidden-chat notices. */

export type ConnectionPhase = "connecting" | "connected" | "down";

export const CONNECTION_GRACE_MS = 2_000;
export const CONNECTION_RELOAD_AFTER_MS = 10_000;
export const CONNECTION_RETRY_MS = 1_000;

export type ConnectionState = {
  phase: ConnectionPhase;
  hadConnected: boolean;
  lostShown: boolean;
  offerReload: boolean;
};

export const INITIAL_CONNECTION_STATE: ConnectionState = {
  phase: "connecting",
  hadConnected: false,
  lostShown: false,
  offerReload: false,
};

export type ConnectionEvent =
  | { type: "snapshot" }
  | { type: "close" }
  | { type: "grace" }
  | { type: "reload" };

export type ConnectionNotice = "lost" | "reconnected" | null;

export function reduceConnection(
  state: ConnectionState,
  event: ConnectionEvent,
): { state: ConnectionState; notice: ConnectionNotice } {
  switch (event.type) {
    case "snapshot": {
      const notice: ConnectionNotice = state.lostShown ? "reconnected" : null;
      return {
        state: {
          phase: "connected",
          hadConnected: true,
          lostShown: false,
          offerReload: false,
        },
        notice,
      };
    }
    case "close": {
      if (!state.hadConnected) {
        return { state: { ...state, phase: "connecting" }, notice: null };
      }
      if (state.phase === "down") return { state, notice: null };
      return {
        state: {
          phase: "down",
          hadConnected: true,
          lostShown: false,
          offerReload: false,
        },
        notice: null,
      };
    }
    case "grace": {
      if (state.phase !== "down" || state.lostShown) return { state, notice: null };
      return { state: { ...state, lostShown: true }, notice: "lost" };
    }
    case "reload": {
      if (state.phase !== "down" || state.offerReload) return { state, notice: null };
      return { state: { ...state, offerReload: true }, notice: null };
    }
  }
}

export function connectionDotLabel(phase: ConnectionPhase, offerReload: boolean): string {
  if (offerReload) return "Offline — Reload";
  if (phase === "connected") return "Connected";
  if (phase === "connecting") return "Connecting to this Mac";
  return "Lost connection to this Mac";
}

export function connectionDotVisible(phase: ConnectionPhase, lostShown: boolean): boolean {
  return phase === "down" && lostShown;
}

let currentConnectionPhase: ConnectionPhase = INITIAL_CONNECTION_STATE.phase;

/** Latest WS phase for toast gating (set from `useProjectSession`). */
export function setLiveConnectionPhase(phase: ConnectionPhase): void {
  currentConnectionPhase = phase;
}

export function suppressNetworkFailureToast(phase: ConnectionPhase = currentConnectionPhase): boolean {
  return phase === "down";
}

export type FailureStreak = { hadSuccess: boolean; failing: boolean };

export const INITIAL_FAILURE_STREAK: FailureStreak = { hadSuccess: false, failing: false };

/** Toast a repeating poll only after a success, and only once per failure streak. */
export function noteFailureStreak(
  prev: FailureStreak,
  ok: boolean,
  opts?: { suppressToast?: boolean },
): { next: FailureStreak; toast: boolean } {
  if (ok) return { next: { hadSuccess: true, failing: false }, toast: false };
  if (!prev.hadSuccess) return { next: prev, toast: false };
  if (prev.failing) return { next: prev, toast: false };
  if (opts?.suppressToast) return { next: prev, toast: false };
  return { next: { hadSuccess: true, failing: true }, toast: true };
}

export type ChatTurnFlags = { streaming: boolean; askUser: boolean; error: boolean };

export const INITIAL_CHAT_TURN_FLAGS: ChatTurnFlags = { streaming: false, askUser: false, error: false };

export type HiddenChatNoticeKind = "finished" | "ask-user" | "failed";

export const HIDDEN_CHAT_NOTICE: Record<HiddenChatNoticeKind, string> = {
  finished: "Reply finished",
  "ask-user": "The agent is asking a question",
  failed: "Reply failed",
};

export function hiddenChatNotice(
  chatHidden: boolean,
  prev: ChatTurnFlags,
  next: ChatTurnFlags,
): HiddenChatNoticeKind | null {
  if (!chatHidden) return null;
  if (next.askUser && !prev.askUser) return "ask-user";
  if (next.error && !prev.error) return "failed";
  if (prev.streaming && !next.streaming && !next.askUser && !next.error) return "finished";
  return null;
}
