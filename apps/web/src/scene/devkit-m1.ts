/** Reference picture for a chip. Not a file in the project. */
export const DEVKIT_M1 = "esp32-c3-devkitm-1";

/** Every `esp32c3` image shows this board. Any other chip has no picture yet. */
export function boardViewForChip(chip: string | null): typeof DEVKIT_M1 | null {
  return chip === "esp32c3" ? DEVKIT_M1 : null;
}

/** Espressif dimension drawing, millimetres. Header pitch is 2.54. */
export const PCB_WIDTH = 25.4;
export const PCB_LENGTH = 38.91;
export const PCB_THICKNESS = 1.05;
export const PIN_PITCH = 2.54;
export const HEADER_CENTERS = 22.86;

/** J1, module end first. Short names as printed on the board. */
export const J1 = [
  "GND",
  "3V3",
  "3V3",
  "2",
  "3",
  "GND",
  "RST",
  "GND",
  "0",
  "1",
  "10",
  "GND",
  "5V",
  "5V",
  "GND",
] as const;

/** J3, module end first. */
export const J3 = [
  "GND",
  "TX",
  "RX",
  "GND",
  "9",
  "8",
  "GND",
  "7",
  "6",
  "5",
  "4",
  "GND",
  "18",
  "19",
  "GND",
] as const;

/** Three-quarter view: Micro-USB in front, module and antenna behind. */
export const HOME_CAMERA = [14, 54, -56] as const;
export const HOME_TARGET = [0, 0, -2] as const;

export function pinZ(index: number, count: number): number {
  return ((count - 1) / 2 - index) * PIN_PITCH;
}
