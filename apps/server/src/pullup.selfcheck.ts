import { maskHasPin, type WorldDocument } from "@sfab-bench/contract";
import { assemble } from "avr8js/dist/esm/utils/assembler.js";

import { AvrBoard } from "./world/board";
import { FLASH_BYTES } from "./world/ihex";
import { gpioInputNets } from "./world/wiring";

/**
 * avr8js does not resolve INPUT_PULLUP. The bridge holds an undriven
 * input high, and a wired output wins. Built without arduino-cli: the
 * program is a few instructions from avr8js's assembler.
 *
 *   ldi r16, 0x04
 *   out 0x0b, r16      ; PORTD bit 2, DDRD stays 0 → D2 INPUT_PULLUP
 * loop:
 *   in r17, 0x09       ; PIND
 *   rjmp loop
 */

function expect(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(label);
}

const source = `
ldi r16, 0x04
out 0x0b, r16
loop:
in r17, 0x09
rjmp loop
`;
const assembled = assemble(source);
expect(assembled.errors.length === 0, assembled.errors.join("; "));
const image = new Uint8Array(FLASH_BYTES);
image.fill(0xff);
image.set(assembled.bytes);

const board = new AvrBoard("uno");
board.load(image);
expect(board.running, "pull-up program did not load");
board.stepMillis();
const read = board.peekByte(17);
expect(read !== null && (read & 0x04) !== 0, `digitalRead D2 was ${read}`);
const high = board.peekPins();
expect(
  !maskHasPin(high.ddr, "D2") && maskHasPin(high.level, "D2"),
  `D2 pin table ddr ${high.ddr} level ${high.level}`
);
console.log("pull-up: D2 reads HIGH, pin table in H");

board.setDriven(2, false);
board.stepMillis();
const driven = board.peekByte(17);
expect(
  driven !== null && (driven & 0x04) === 0,
  `wired low lost to the pull-up (${driven})`
);
const low = board.peekPins();
expect(
  !maskHasPin(low.ddr, "D2") && !maskHasPin(low.level, "D2"),
  "a wired output low reads L"
);

board.setDriven(2, null);
board.stepMillis();
const released = board.peekByte(17);
expect(
  released !== null && (released & 0x04) !== 0,
  `releasing the wire did not restore the pull-up (${released})`
);
console.log("pull-up: a wired output wins, then the pin reads HIGH again");

const nets = gpioInputNets({
  boards: [{ id: "uno", board: "uno" }],
  wires: [["uno.D2", "uno.D3"]],
} as WorldDocument);
const d2 = nets.find((net) => net.bit === 2);
const d3 = nets.find((net) => net.bit === 3);
expect(
  d2?.drivers.some((driver) => driver.bit === 3) &&
    d3?.drivers.some((driver) => driver.bit === 2),
  `D2/D3 net ${JSON.stringify(nets)}`
);
console.log("pull-up nets: D2 and D3 can drive each other");

console.log("pullup.selfcheck ok");
