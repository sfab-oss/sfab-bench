/** Connection phase, silent-failure dedupe, hidden-chat notices, error-text contrast. */

export type ConnectionPhase = "connecting" | "connected" | "reconnecting" | "offline";

export const CONNECTION_OFFLINE_AFTER_FAILURES = 3;
export const CONNECTION_RELOAD_AFTER_MS = 10_000;
export const CONNECTION_RETRY_MS = 1_000;

export type ConnectionState = {
  phase: ConnectionPhase;
  consecutiveFailures: number;
  disconnectedAt: number | null;
  offlineAt: number | null;
  offerReload: boolean;
  hadConnected: boolean;
};

export const INITIAL_CONNECTION_STATE: ConnectionState = {
  phase: "connecting",
  consecutiveFailures: 0,
  disconnectedAt: null,
  offlineAt: null,
  offerReload: false,
  hadConnected: false,
};

export type ConnectionEvent =
  | { type: "snapshot"; now: number }
  | { type: "close"; now: number }
  | { type: "tick"; now: number };

export type ConnectionNotice = "lost" | "reconnected" | "reload" | null;

export function reduceConnection(
  state: ConnectionState,
  event: ConnectionEvent,
): { state: ConnectionState; notice: ConnectionNotice } {
  switch (event.type) {
    case "snapshot": {
      const notice: ConnectionNotice = state.hadConnected && state.phase !== "connected" ? "reconnected" : null;
      return {
        state: {
          phase: "connected",
          consecutiveFailures: 0,
          disconnectedAt: null,
          offlineAt: null,
          offerReload: false,
          hadConnected: true,
        },
        notice,
      };
    }
    case "close": {
      if (state.phase === "connected") {
        return {
          state: {
            phase: "reconnecting",
            consecutiveFailures: 1,
            disconnectedAt: event.now,
            offlineAt: null,
            offerReload: false,
            hadConnected: true,
          },
          notice: "lost",
        };
      }
      const failures = state.consecutiveFailures + 1;
      const goOffline = state.hadConnected && failures >= CONNECTION_OFFLINE_AFTER_FAILURES;
      const offlineAt = goOffline ? (state.offlineAt ?? event.now) : null;
      return {
        state: {
          phase: goOffline ? "offline" : state.hadConnected ? "reconnecting" : "connecting",
          consecutiveFailures: failures,
          disconnectedAt: state.disconnectedAt ?? event.now,
          offlineAt,
          offerReload: false,
          hadConnected: state.hadConnected,
        },
        notice: null,
      };
    }
    case "tick": {
      if (state.phase !== "offline" || state.offlineAt == null) return { state, notice: null };
      const offerReload = event.now - state.offlineAt >= CONNECTION_RELOAD_AFTER_MS;
      if (offerReload === state.offerReload) return { state, notice: null };
      return {
        state: { ...state, offerReload },
        notice: offerReload ? "reload" : null,
      };
    }
  }
}

export function connectionDotLabel(phase: ConnectionPhase, offerReload: boolean): string {
  if (offerReload) return "Offline — Reload";
  if (phase === "connected") return "Connected";
  if (phase === "connecting") return "Connecting to this Mac";
  if (phase === "reconnecting") return "Reconnecting…";
  return "Offline — this page can't reach this Mac";
}

export function connectionDotVisible(phase: ConnectionPhase): boolean {
  return phase === "reconnecting" || phase === "offline";
}

export type FailureStreak = { hadSuccess: boolean; failing: boolean };

export const INITIAL_FAILURE_STREAK: FailureStreak = { hadSuccess: false, failing: false };

/** Toast a repeating poll only after a success, and only once per failure streak. */
export function noteFailureStreak(prev: FailureStreak, ok: boolean): { next: FailureStreak; toast: boolean } {
  if (ok) return { next: { hadSuccess: true, failing: false }, toast: false };
  if (!prev.hadSuccess) return { next: prev, toast: false };
  if (prev.failing) return { next: prev, toast: false };
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

/** OKLCH used by `--error-text-raw` in `index.css`. Card matches background in both themes. */
export const ERROR_TEXT_LIGHT = { l: 0.5, c: 0.22, h: 27.325 } as const;
export const ERROR_TEXT_DARK = { l: 0.78, c: 0.14, h: 25.331 } as const;
export const CANVAS_LIGHT = { l: 1, c: 0, h: 0 } as const;
export const CANVAS_DARK = { l: 0.145, c: 0, h: 0 } as const;

export type Oklch = { l: number; c: number; h: number };

function oklchToOklab(color: Oklch): { L: number; a: number; b: number } {
  const rad = (color.h * Math.PI) / 180;
  return { L: color.l, a: color.c * Math.cos(rad), b: color.c * Math.sin(rad) };
}

function mixOklab(
  from: { L: number; a: number; b: number },
  to: { L: number; a: number; b: number },
  t: number,
): { L: number; a: number; b: number } {
  return {
    L: from.L * (1 - t) + to.L * t,
    a: from.a * (1 - t) + to.a * t,
    b: from.b * (1 - t) + to.b * t,
  };
}

function oklabToLinearSrgb({ L, a, b }: { L: number; a: number; b: number }): {
  r: number;
  g: number;
  b: number;
} {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function relativeLuminance(lin: { r: number; g: number; b: number }): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(lin.r) + 0.7152 * clamp(lin.g) + 0.0722 * clamp(lin.b);
}

export function contrastRatio(fg: Oklch, bg: Oklch): number {
  const L1 = relativeLuminance(oklabToLinearSrgb(oklchToOklab(fg)));
  const L2 = relativeLuminance(oklabToLinearSrgb(oklchToOklab(bg)));
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Same mix as `--error-text` / area 10 contrast slider. */
export function mixErrorText(raw: Oklch, background: Oklch, contrastPercent: number, target: "black" | "white"): Oklch {
  const base = Math.min(contrastPercent, 100) / 100;
  const boost = Math.max(contrastPercent - 100, 0) / 100;
  const bg = oklchToOklab(background);
  const faded = mixOklab(bg, oklchToOklab(raw), base);
  const aimed = mixOklab(faded, oklchToOklab({ l: target === "black" ? 0 : 1, c: 0, h: 0 }), boost);
  const c = Math.hypot(aimed.a, aimed.b);
  const h = (Math.atan2(aimed.b, aimed.a) * 180) / Math.PI;
  return { l: aimed.L, c, h: h < 0 ? h + 360 : h };
}

export type ErrorTextContrastRow = {
  theme: "light" | "dark";
  contrast: 90 | 100 | 130;
  ratio: number;
};

export function errorTextContrastRows(): ErrorTextContrastRow[] {
  const rows: ErrorTextContrastRow[] = [];
  for (const contrast of [90, 100, 130] as const) {
    const light = mixErrorText(ERROR_TEXT_LIGHT, CANVAS_LIGHT, contrast, "black");
    rows.push({ theme: "light", contrast, ratio: contrastRatio(light, CANVAS_LIGHT) });
  }
  for (const contrast of [90, 100, 130] as const) {
    const dark = mixErrorText(ERROR_TEXT_DARK, CANVAS_DARK, contrast, "white");
    rows.push({ theme: "dark", contrast, ratio: contrastRatio(dark, CANVAS_DARK) });
  }
  return rows;
}
