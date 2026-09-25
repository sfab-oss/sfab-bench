import {
  commandIsOwn,
  commandNotice,
  formatSimTime,
  formatWorldIssues,
} from "./world-issues";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const lines = formatWorldIssues([
  {
    code: "missing-file",
    path: "robots[0].urdf",
    message:
      "URDF is missing. Hint: export STL with $cad (`cadgen stl build`).",
  },
  {
    code: "schema",
    path: "boards[0].size",
    message: "Size needs three lengths.",
  },
]);
expect(lines.length === 2, "one line per error");
expect(lines[0]?.code === "missing-file", "code");
expect(lines[0]?.path === "robots[0].urdf", "path");
expect(lines[0]?.message === "URDF is missing.", "message drops the hint");
expect(
  lines[0]?.hint === "export STL with $cad (`cadgen stl build`).",
  "hint text"
);
expect(lines[1]?.hint === "", "no hint stays empty");
expect(lines[1]?.message === "Size needs three lengths.", "plain message");

const fallback = formatWorldIssues([], "could not open this world");
expect(fallback.length === 1, "a message with no rows still shows");
expect(fallback[0]?.code === "error", "fallback code");
expect(
  fallback[0]?.message === "could not open this world",
  "fallback message"
);
expect(formatWorldIssues([], "  ").length === 0, "blank fallback is hidden");
expect(formatWorldIssues([]).length === 0, "nothing to show");

expect(formatSimTime(12.345) === "12.345 s", "sim time");
expect(formatSimTime(0) === "0.000 s", "zero sim time");
expect(formatSimTime(Number.NaN) === "0.000 s", "bad sim time");

expect(
  commandNotice("pause", { kind: "paired", label: "Headset A" }) ===
    "Paused by Headset A",
  "paired pause"
);
expect(
  commandNotice("play", { kind: "agent" }) === "Played by agent",
  "agent play"
);

const mac = { id: "loopback", label: "Mac" };
const headset = { id: "dev-1", label: "Headset A" };
expect(
  commandIsOwn({ kind: "loopback", label: "Mac" }, mac),
  "this Mac sent it"
);
expect(
  !commandIsOwn({ kind: "loopback", label: "Mac" }, headset),
  "the headset did not"
);
expect(
  commandIsOwn({ kind: "paired", label: "Headset A" }, headset),
  "this headset sent it"
);
expect(!commandIsOwn({ kind: "agent" }, mac), "the agent is someone else");

console.log("world-issues.selfcheck ok");
