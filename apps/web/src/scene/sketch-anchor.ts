import type { Group } from "three";

/** CadModel wrap; SketchInput writes wrap-local metres into the store. */
let wrap: Group | null = null;

export function setSketchWrap(group: Group | null) {
  wrap = group;
}

export function sketchWrap(): Group | null {
  return wrap;
}
