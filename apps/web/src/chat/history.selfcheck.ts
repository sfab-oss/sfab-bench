import {
  decideNewChatAction,
  EMPTY_THREAD_TITLE,
  firstUserLine,
  formatRelativeTime,
  HISTORY_POLL_MS,
  isEmptyHistoryTitle,
  msUntilNextMinuteTick,
  partitionHistoryRows,
  threadRowPip,
  titleRefSegments,
} from "./history";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(HISTORY_POLL_MS === 10_000, "history poll is ~10s");
expect(isEmptyHistoryTitle("New chat"), "default title is empty");
expect(isEmptyHistoryTitle("  New chat  "), "trimmed default title is empty");
expect(isEmptyHistoryTitle(""), "blank title is empty");
expect(!isEmptyHistoryTitle("second question"), "real title is not empty");

const now = Date.parse("2026-09-15T12:00:00.000Z");
expect(formatRelativeTime(now - 12_000, now) === "just now", "under a minute");
expect(formatRelativeTime(now - 60_000, now) === "1 min ago", "one minute");
expect(formatRelativeTime(now - 2 * 60_000, now) === "2 min ago", "two minutes");
expect(formatRelativeTime(now - 59 * 60_000, now) === "59 min ago", "fifty-nine minutes");
expect(formatRelativeTime(now - 60 * 60_000, now) === "1 hr ago", "one hour");
expect(formatRelativeTime(now - 5 * 60 * 60_000, now) === "5 hr ago", "five hours");
expect(formatRelativeTime(now - 24 * 60 * 60_000, now) === "1 day ago", "one day");
expect(formatRelativeTime(now - 3 * 24 * 60 * 60_000, now) === "3 days ago", "three days");
expect(formatRelativeTime(0, now) === "", "missing timestamp");
expect(msUntilNextMinuteTick(now) === 60_000, "exact minute waits a full minute");
expect(msUntilNextMinuteTick(now + 15_000) === 45_000, "aligns to the next minute");

const labeled = titleRefSegments("Look at #o1.1 please", (ref) => (ref === "#o1.1" ? "Bracket" : null));
expect(labeled.length === 3, "text / ref / text");
expect(labeled[0]?.type === "text" && labeled[0].value === "Look at ", "leading prose");
expect(labeled[1]?.type === "ref" && labeled[1].ref === "#o1.1" && labeled[1].label === "Bracket", "resolved label");
expect(labeled[2]?.type === "text" && labeled[2].value === " please", "trailing prose");

const unresolved = titleRefSegments("see #o9.9", () => null);
expect(unresolved[1]?.type === "ref" && unresolved[1].label === "#o9.9", "unresolved stays the token");
expect(titleRefSegments("plain title", () => "x")[0]?.type === "text", "no refs");
expect(titleRefSegments("", () => null).length === 0, "empty title");

const preview = firstUserLine([
  { role: "user", parts: [{ type: "text", text: "[viewer] file=bracket.step\nHow tall is #o1.2.1?" }] },
]);
expect(preview === "How tall is #o1.2.1?", "preview strips the viewer stamp");
expect(firstUserLine([{ role: "assistant", parts: [{ type: "text", text: "hi" }] }]) === null, "no user");
expect(firstUserLine([{ role: "user", parts: [{ type: "text", text: "[viewer] x\n" }] }]) === null, "stamp-only");

const empty = { id: "e1", title: EMPTY_THREAD_TITLE };
const otherEmpty = { id: "e2", title: EMPTY_THREAD_TITLE };
const named = { id: "n1", title: "second question" };

expect(decideNewChatAction({ currentId: "e1", currentEmpty: true, threads: [empty, named] }).action === "focus", "empty current focuses");
expect(
  decideNewChatAction({ currentId: "n1", currentEmpty: false, threads: [named, empty] }).action === "open" &&
    (decideNewChatAction({ currentId: "n1", currentEmpty: false, threads: [named, empty] }) as { id?: string }).id ===
      "e1",
  "reuse the existing empty",
);
expect(decideNewChatAction({ currentId: "n1", currentEmpty: false, threads: [named] }).action === "create", "no empty to reuse");
expect(decideNewChatAction({ currentId: null, currentEmpty: true, threads: [] }).action === "create", "hydrate create");

const split = partitionHistoryRows([named, empty, otherEmpty], "n1", false);
expect(split.visible.length === 1 && split.visible[0]?.id === "n1", "named stays visible");
expect(split.emptyHidden.map((row) => row.id).join(",") === "e1,e2", "empties go to the hidden pile");
const currentEmptySplit = partitionHistoryRows([empty, named], "e1", true);
expect(
  currentEmptySplit.visible.some((row) => row.id === "e1") && currentEmptySplit.emptyHidden.length === 0,
  "current empty stays in the list",
);

expect(
  threadRowPip({ rowId: "n1", currentId: "n1", streaming: true, askUser: true, error: true }) === "streaming",
  "streaming wins on this tab",
);
expect(
  threadRowPip({ rowId: "n1", currentId: "n1", streaming: false, askUser: true, error: true }) === "ask-user",
  "ask-user next",
);
expect(
  threadRowPip({ rowId: "n1", currentId: "n1", streaming: false, askUser: false, error: true }) === "error",
  "error pip",
);
expect(
  threadRowPip({ rowId: "e1", currentId: "n1", streaming: true, askUser: true, error: true }) === null,
  "other tabs are not faked",
);

console.log("history.selfcheck ok");
