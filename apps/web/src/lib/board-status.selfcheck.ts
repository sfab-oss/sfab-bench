import { boardStatusLabel, scrubbedBoardStatus } from "./board-status";

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
expect(
  scrubbedBoardStatus({ running: true, brownout: false }) === "running",
  "a recorded running board is not paused"
);
expect(
  scrubbedBoardStatus({ running: false, brownout: true }) === "brownout",
  "a recorded brownout stays brownout"
);
expect(
  scrubbedBoardStatus({ running: false, fault: "bad checksum" }) === "stopped",
  "a recorded fault stays stopped"
);
expect(scrubbedBoardStatus(undefined) === "", "no recorded board yet");

console.log("board-status.selfcheck ok");
