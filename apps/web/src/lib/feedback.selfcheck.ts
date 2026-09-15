import {
  CONNECTION_GRACE_MS,
  CONNECTION_RELOAD_AFTER_MS,
  ERROR_TEXT_DARK,
  ERROR_TEXT_LIGHT,
  HIDDEN_CHAT_NOTICE,
  INITIAL_CHAT_TURN_FLAGS,
  INITIAL_CONNECTION_STATE,
  INITIAL_FAILURE_STREAK,
  connectionDotLabel,
  connectionDotVisible,
  contrastRatio,
  errorTextContrastRows,
  hiddenChatNotice,
  mixErrorText,
  noteFailureStreak,
  reduceConnection,
  suppressNetworkFailureToast,
  CANVAS_DARK,
  CANVAS_LIGHT,
} from "./feedback";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(CONNECTION_GRACE_MS === 2_000, "lost toast waits 2s");
expect(CONNECTION_RELOAD_AFTER_MS === 10_000, "reload after 10s down");

let conn = INITIAL_CONNECTION_STATE;
expect(conn.phase === "connecting", "starts connecting");
expect(connectionDotVisible(conn.phase, conn.lostShown) === false, "connecting is quiet");

let step = reduceConnection(conn, { type: "close" });
conn = step.state;
expect(conn.phase === "connecting", "close before first snapshot stays connecting");
expect(step.notice === null, "no lost toast before a session");

step = reduceConnection(conn, { type: "snapshot" });
conn = step.state;
expect(conn.phase === "connected" && conn.hadConnected, "snapshot connects");
expect(step.notice === null, "first connect is not Reconnected");
expect(connectionDotVisible(conn.phase, conn.lostShown) === false, "connected is quiet");
expect(connectionDotLabel("connected", false) === "Connected", "connected label");

step = reduceConnection(conn, { type: "close" });
conn = step.state;
expect(conn.phase === "down" && conn.lostShown === false, "drop → down, still in grace");
expect(step.notice === null, "grace has no toast yet");
expect(connectionDotVisible(conn.phase, conn.lostShown) === false, "grace is quiet");
expect(suppressNetworkFailureToast("down"), "down suppresses network toasts");

step = reduceConnection(conn, { type: "close" });
expect(step.notice === null, "close during grace is silent");
expect(step.state.lostShown === false && step.state.offerReload === false, "grace close does not announce");
conn = step.state;

step = reduceConnection(conn, { type: "grace" });
conn = step.state;
expect(conn.lostShown, "grace announces");
expect(step.notice === "lost", "one-shot lost toast");
expect(connectionDotVisible(conn.phase, conn.lostShown), "lost shows the footer dot");
expect(connectionDotLabel("down", false) === "Lost connection to this Mac", "down label");

step = reduceConnection(conn, { type: "grace" });
expect(step.notice === null, "grace does not re-toast");

step = reduceConnection(conn, { type: "reload" });
conn = step.state;
expect(conn.offerReload, "10s down offers Reload");
expect(step.notice === null, "Reload is footer-only");
expect(connectionDotLabel("down", true) === "Offline — Reload", "reload label");

step = reduceConnection(conn, { type: "close" });
expect(step.notice === null, "close while down is not a second toast");
expect(step.state.offerReload, "close while down keeps Reload");
conn = step.state;

step = reduceConnection(conn, { type: "reload" });
expect(step.notice === null && step.state.offerReload, "reload notice does not repeat");

step = reduceConnection(conn, { type: "snapshot" });
expect(step.state.phase === "connected" && step.state.offerReload === false, "snapshot clears down");
expect(step.notice === "reconnected", "reconnected toast after a shown loss");
conn = step.state;

step = reduceConnection(conn, { type: "close" });
step = reduceConnection(step.state, { type: "snapshot" });
expect(step.notice === null, "reconnect during grace has no toasts");

const firstFail = noteFailureStreak(INITIAL_FAILURE_STREAK, false);
expect(firstFail.toast === false, "first-load fail stays inline");
expect(firstFail.next.hadSuccess === false, "no success yet");

const firstOk = noteFailureStreak(INITIAL_FAILURE_STREAK, true);
expect(firstOk.next.hadSuccess && firstOk.toast === false, "success is silent");

const streakToast = noteFailureStreak(firstOk.next, false);
expect(streakToast.toast, "refresh fail after success toasts once");
const streakHold = noteFailureStreak(streakToast.next, false);
expect(streakHold.toast === false, "same streak does not re-toast");
const recovered = noteFailureStreak(streakHold.next, true);
expect(recovered.next.failing === false, "success clears the streak");
expect(noteFailureStreak(recovered.next, false).toast, "a new streak toasts again");

expect(suppressNetworkFailureToast("connected") === false, "connected allows network toasts");
expect(suppressNetworkFailureToast("connecting") === false, "connecting allows network toasts");
expect(suppressNetworkFailureToast("down"), "down suppresses network toasts");

const outageHold = noteFailureStreak(firstOk.next, false, { suppressToast: true });
expect(outageHold.toast === false, "outage does not consume the catalog toast");
expect(outageHold.next.failing === false, "streak stays open during outage");
expect(noteFailureStreak(outageHold.next, false).toast, "still-failing after reconnect toasts");

const idle = INITIAL_CHAT_TURN_FLAGS;
expect(hiddenChatNotice(true, idle, idle) === null, "no notice without a transition");
expect(hiddenChatNotice(false, { ...idle, streaming: true }, idle) === null, "visible chat has no toast");
expect(
  hiddenChatNotice(true, { streaming: true, askUser: false, error: false }, idle) === "finished",
  "hidden finish",
);
expect(
  hiddenChatNotice(
    true,
    { streaming: true, askUser: false, error: false },
    { streaming: false, askUser: true, error: false },
  ) === "ask-user",
  "hidden ask-user on finish",
);
expect(
  hiddenChatNotice(true, idle, { streaming: false, askUser: true, error: false }) === "ask-user",
  "hidden ask-user while idle",
);
expect(
  hiddenChatNotice(
    true,
    { streaming: true, askUser: false, error: false },
    { streaming: false, askUser: false, error: true },
  ) === "failed",
  "hidden fail on finish",
);
expect(
  hiddenChatNotice(
    true,
    { streaming: true, askUser: true, error: false },
    { streaming: false, askUser: true, error: false },
  ) === null,
  "already-asking does not re-toast on finish",
);
expect(HIDDEN_CHAT_NOTICE["ask-user"] === "The agent is asking a question", "ask copy");
expect(HIDDEN_CHAT_NOTICE.failed === "Reply failed", "failed copy");

const rows = errorTextContrastRows();
const expected = [
  ["light", 90, "5.37"],
  ["light", 100, "6.39"],
  ["light", 130, "11.77"],
  ["dark", 90, "7.46"],
  ["dark", 100, "9.14"],
  ["dark", 130, "11.64"],
] as const;
expect(rows.length === expected.length, "six contrast rows");
for (let i = 0; i < expected.length; i++) {
  const row = rows[i];
  const want = expected[i];
  expect(row?.theme === want[0] && row.contrast === want[1], `${want[0]} ${want[1]}% row`);
  expect(row && row.ratio.toFixed(2) === want[2], `${want[0]} ${want[1]}% is ${want[2]}`);
  expect(row != null && row.ratio >= 4.5, `${want[0]} ${want[1]}% passes AA`);
}

const light90 = mixErrorText(ERROR_TEXT_LIGHT, CANVAS_LIGHT, 90, "black");
const dark90 = mixErrorText(ERROR_TEXT_DARK, CANVAS_DARK, 90, "white");
expect(contrastRatio(light90, CANVAS_LIGHT) === rows[0]?.ratio, "light 90 uses the mixer");
expect(contrastRatio(dark90, CANVAS_DARK) === rows[3]?.ratio, "dark 90 uses the mixer");

const lightRaw = contrastRatio(ERROR_TEXT_LIGHT, CANVAS_LIGHT);
const darkRaw = contrastRatio(ERROR_TEXT_DARK, CANVAS_DARK);
expect(lightRaw >= 4.5 && darkRaw >= 4.5, "raw tokens pass on canvas/card");

console.log("feedback.selfcheck ok");
