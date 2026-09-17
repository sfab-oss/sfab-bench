/**
 * Display names for the model tree and Selection panel.
 *
 * OCCT/XCAF often stores a dump of the TDF label (`=>[0:1:1:2]`) or the
 * entry path (`0:1:1:2`) as TDataStd_Name when the STEP has no product
 * name. The loader then falls back to the occurrence id (`o1.1`). Those
 * are identity, not labels — show `Part 1.1` from the `#o` ref instead.
 *
 * A single-solid file with a raw name uses the file stem (`cube` from
 * `cube.step`) when the caller passes it. Real STEP names pass through.
 */

const OCCT_DUMP = /^=>\s*\[[0-9:]+\]\s*$/;
const TAG_PATH = /^[0-9]+(?::[0-9]+)+$/;
const OCCURRENCE_ID = /^o[0-9]+(?:\.[0-9]+)*$/;
const OCCURRENCE_PATH = /#?o(\d+(?:\.\d+)*)(?:\.f\d+)?$/i;

export function fileStemFromLabel(fileLabel: string): string {
  const name = fileLabel.trim().split("/").filter(Boolean).pop() ?? "";
  return name.replace(/\.(step|stp|glb|gltf)$/i, "") || name;
}

/** Stem is only for a lone listed solid — not siblings or a nested assembly. */
export function partLabelFileStem(
  partCount: number,
  fileLabel: string
): string | undefined {
  if (partCount !== 1) return undefined;
  return fileStemFromLabel(fileLabel) || undefined;
}

/** Path segments from a `#o1.1.2` / `o1.1.2` / face ref, or null. */
export function occurrencePath(ref?: string | null): string | null {
  if (!ref) return null;
  const match = OCCURRENCE_PATH.exec(ref.trim());
  return match?.[1] ?? null;
}

export function isRawPartName(name: string): boolean {
  const text = name.trim();
  if (!text) return true;
  return (
    OCCT_DUMP.test(text) || TAG_PATH.test(text) || OCCURRENCE_ID.test(text)
  );
}

export function partDisplayName(
  part: { name: string; cadRef?: string | null },
  ref?: string | null,
  fileStem?: string
): string {
  const raw = part.name;
  if (!isRawPartName(raw)) return raw;
  const stem = fileStem?.trim();
  if (stem) return stem;
  const path = occurrencePath(ref ?? part.cadRef);
  return path ? `Part ${path}` : "Part";
}

/** Suffix colliding sibling labels with the occurrence path (or a counter). */
export function disambiguateSiblingNames(
  items: readonly { key: string; display: string; ref?: string | null }[]
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.display, (counts.get(item.display) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  const dupIndex = new Map<string, number>();
  for (const item of items) {
    if ((counts.get(item.display) ?? 0) < 2) {
      out.set(item.key, item.display);
      continue;
    }
    const path = occurrencePath(item.ref);
    if (path) {
      out.set(item.key, `${item.display} (${path})`);
      continue;
    }
    const n = (dupIndex.get(item.display) ?? 0) + 1;
    dupIndex.set(item.display, n);
    out.set(item.key, `${item.display} (${n})`);
  }
  return out;
}
