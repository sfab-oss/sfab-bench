import { boardStatusLabel } from "./board-status";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(boardStatusLabel(undefined, false) === "", "no board yet");
expect(
  boardStatusLabel({ running: true }, false) === "paused",
  "a healthy paused board says paused"
);
expect(
  boardStatusLabel({ running: true }, true) === "running",
  "a healthy playing board says running"
);
expect(
  boardStatusLabel({ running: false, fault: "bad checksum" }, false) ===
    "stopped",
  "a fault says stopped"
);
expect(
  boardStatusLabel({ running: false }, true) === "stopped",
  "a stopped board stays stopped while the world plays"
);
expect(
  boardStatusLabel({ running: false, brownout: true }, true) === "brownout",
  "a board held in reset says brownout"
);
expect(
  boardStatusLabel({ running: true, brownout: false }, false) === "paused",
  "a board that is not in brownout stays paused"
);

console.log("board-status.selfcheck ok");
