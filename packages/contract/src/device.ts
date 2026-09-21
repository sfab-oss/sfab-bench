/**
 * A firmware document is the flash image. The chip is the suffix, the same
 * job `.step` does for CAD: `app.esp32c3.bin`. A bare `*.bin` is not one.
 * ADR 0008.
 */

export const FIRMWARE_CHIPS = ["esp32c3"] as const;

export type FirmwareChip = (typeof FIRMWARE_CHIPS)[number];

const FIRMWARE_NAME = /\.([a-z0-9]+)\.bin$/i;

/** Chip for a catalog name, or null when that name is not a firmware document. */
export function firmwareChip(path: string): FirmwareChip | null {
  const name = path.split(/[/\\]/).pop() ?? path;
  const match = FIRMWARE_NAME.exec(name);
  const id = match?.[1]?.toLowerCase();
  if (!id) return null;
  for (const chip of FIRMWARE_CHIPS) {
    if (chip === id) return chip;
  }
  return null;
}

/**
 * One running machine. Every tab with this `?device=`, and the agent tools,
 * attach to it. They do not each own a copy.
 */
export type DeviceMachine = {
  /** Absolute project root, the same string as `?project=`. */
  project: string;
  /** Project-relative flash image. */
  device: string;
  chip: FirmwareChip;
};
