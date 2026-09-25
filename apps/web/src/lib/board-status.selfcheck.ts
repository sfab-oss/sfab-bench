import { powerFeeds } from "@sfab-bench/contract";

import {
  boardStatusLabel,
  boardWarningLine,
  recordedSoaLine,
  scrubbedBoardStatus,
} from "./board-status";

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
const soa =
  "supply 3.20 V is below the 3.78 V the ATmega328P needs at 16 MHz; real boards may misbehave";
expect(
  boardWarningLine([{ message: soa }]) === soa,
  "the board status line is the SOA warning"
);
expect(boardWarningLine(undefined) === "", "no warning is a blank line");
expect(
  recordedSoaLine(true, { usb: { voltage: 3.2, minVoltage: 3.2 } }, "usb") ===
    soa,
  "a scrubbed frame in the band uses the same sentence"
);
expect(
  recordedSoaLine(false, { usb: { voltage: 3.2, minVoltage: 3.2 } }, "usb") ===
    "",
  "a frame outside the band has no line"
);
const twoRails = {
  sag: { voltage: 3.2, minVoltage: 3.2 },
  usb: { voltage: 5, minVoltage: 5 },
};
const feeds = powerFeeds({
  boards: [
    { id: "uno", board: "uno" },
    { id: "other", board: "uno" },
  ],
  parts: [],
  supplies: [{ id: "sag" }, { id: "usb" }],
  wires: [
    ["sag.5V", "uno.5V"],
    ["usb.5V", "other.5V"],
  ],
});
expect(feeds.boards.uno === "sag", `uno feed ${feeds.boards.uno}`);
expect(feeds.boards.other === "usb", `other feed ${feeds.boards.other}`);
expect(
  recordedSoaLine(true, twoRails, feeds.boards.uno) === soa,
  "the sagging board uses its own rail"
);
const otherLine = recordedSoaLine(true, twoRails, feeds.boards.other);
expect(
  otherLine !== soa && !otherLine.includes("3.20"),
  `the in-spec board used the other rail: ${otherLine}`
);
expect(
  scrubbedBoardStatus({ running: false, fault: "bad checksum" }) === "stopped",
  "a recorded fault stays stopped"
);
expect(
  boardStatusLabel({ running: false, unpowered: true }, true) === "unpowered",
  "a board no supply reaches says unpowered"
);
expect(
  boardStatusLabel(
    { running: false, fault: "bad checksum", unpowered: true },
    false
  ) === "unpowered",
  "unpowered wins over a fault word"
);
expect(
  scrubbedBoardStatus({ running: false, unpowered: true }) === "unpowered",
  "a scrubbed unpowered board stays unpowered"
);
expect(scrubbedBoardStatus(undefined) === "", "no recorded board yet");

console.log("board-status.selfcheck ok");
