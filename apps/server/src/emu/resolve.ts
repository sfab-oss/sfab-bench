import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { type FirmwareChip, firmwareChip } from "@sfab-bench/contract";

import { insideRoot, posixRel } from "../projects";

/** A flash image big enough for a real app, small enough to refuse a mistake. */
export const MAX_FIRMWARE_BYTES = 16 * 1024 * 1024;

export type ResolvedFirmware = {
  rel: string;
  abs: string;
  chip: FirmwareChip;
  size: number;
};

function existingFile(rootReal: string, abs: string): string | null {
  if (!existsSync(abs)) return null;
  try {
    const real = realpathSync(abs);
    if (!insideRoot(rootReal, real)) return null;
    if (!statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

/** A `.<chip>.bin` inside `root`, or why it is not a firmware document. */
export function resolveFirmware(
  root: string,
  input: string
): ResolvedFirmware | { error: string } {
  const raw = input.trim().replace(/\\/g, "/");
  if (!raw) return { error: "empty path" };
  let base: string;
  try {
    base = realpathSync(root);
  } catch {
    return { error: "the project folder is gone" };
  }
  const qless = raw.split("?")[0] ?? raw;
  const direct = isAbsolute(qless) ? existingFile(base, qless) : null;
  let rel = direct ? posixRel(base, direct) : qless.replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..")) {
    return { error: "path escapes project" };
  }
  const abs = direct ?? existingFile(base, resolve(base, rel));
  if (!abs) return { error: `no file at ${rel}` };
  rel = posixRel(base, abs);
  const chip = firmwareChip(rel);
  if (!chip) return { error: `not a firmware image: ${input}` };
  const size = statSync(abs).size;
  if (size > MAX_FIRMWARE_BYTES) {
    return { error: `${rel} is larger than ${MAX_FIRMWARE_BYTES} bytes` };
  }
  return { rel, abs, chip, size };
}
