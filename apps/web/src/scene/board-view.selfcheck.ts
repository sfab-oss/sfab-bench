import {
  ANTENNA_DEPTH,
  ANTENNA_Z,
  boardViewForChip,
  DEVKIT_M1,
  HEADER_CENTERS,
  J1,
  J3,
  moduleSpan,
  PCB_LENGTH,
  PIN_PITCH,
  pinZ,
  SHIELD_DEPTH,
  SHIELD_Z,
} from "./devkit-m1";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(boardViewForChip("esp32c3") === DEVKIT_M1, "c3 shows the devkit");
expect(boardViewForChip("ESP32C3") === null, "chip id is case-sensitive");
expect(boardViewForChip("esp32") === null, "original esp32 has no picture");
expect(boardViewForChip(null) === null, "no chip has no picture");
expect(J1.length === 15 && J3.length === 15, "fifteen pins a side");
expect(J1.includes("3V3") && J1.includes("5V"), "power names on J1");
expect(J3.includes("TX") && J3.includes("RX"), "uart names on J3");
expect(
  Math.abs(HEADER_CENTERS / PIN_PITCH - 9) < 1e-6,
  "headers are 9 pitches apart"
);
expect(pinZ(0, 15) > pinZ(14, 15), "pin 1 is the module end");

const pcbEnd = PCB_LENGTH / 2;
const antenna = moduleSpan(ANTENNA_Z, ANTENNA_DEPTH);
const shield = moduleSpan(SHIELD_Z, SHIELD_DEPTH);
const overhang = antenna[1] - pcbEnd;
expect(overhang > 2 && overhang < 5, "antenna tab clears the board edge");
expect(antenna[0] < shield[1], "antenna stays under the can");
