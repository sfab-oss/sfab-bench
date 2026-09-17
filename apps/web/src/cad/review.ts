import * as THREE from "three";

export type CadPart = {
  id: number;
  name: string;
  color: string;
  object: THREE.Object3D;
  cadRef?: string;
};

export type CadReview = {
  root: THREE.Group;
  sitHeight: number;
  /** Model-space bounds of `root`, computed once at load time. */
  bounds: THREE.Box3;
  parts: CadPart[];
  partByObject: Map<THREE.Object3D, CadPart>;
  setPartVisible: (id: number, visible: boolean) => void;
  isolate: (id: number) => void;
  showAll: () => void;
};

/** View direction for a fresh load and Toolbar Home. Frame-selection omits this. */
export const FIT_HOME_DIR = [0.6, 0.5, 0.7] as const;

export function homeFitDirection(): THREE.Vector3 {
  return new THREE.Vector3(FIT_HOME_DIR[0], FIT_HOME_DIR[1], FIT_HOME_DIR[2]);
}

/** Home/load pass a direction; "zoom to" selection keeps the current view. */
export function fitDirectionFor(
  scope: "model" | "selection"
): THREE.Vector3 | undefined {
  return scope === "model" ? homeFitDirection() : undefined;
}

/** Object the camera should frame — whole model, or the selected part when there is one. */
export function frameFitObject<T>(
  review:
    | { root: T; parts: Array<{ object: T } | undefined> }
    | null
    | undefined,
  selectedId: number | null,
  scope: "model" | "selection"
): T | null {
  if (!review) return null;
  if (scope === "selection" && selectedId !== null) {
    return review.parts[selectedId]?.object ?? null;
  }
  return review.root;
}

export function cssColor(color: THREE.Color): string {
  return `#${color.getHexString()}`;
}

function setPickable(obj: THREE.Object3D, visible: boolean) {
  obj.visible = visible;
  obj.pointerEvents = visible ? undefined : "none";
}

/** True when `maybeAncestor` is a strict ancestor of `node`. */
export function isAncestor(
  maybeAncestor: THREE.Object3D,
  node: THREE.Object3D
) {
  let p: THREE.Object3D | null = node.parent;
  while (p) {
    if (p === maybeAncestor) return true;
    p = p.parent;
  }
  return false;
}

/** Wraps a loaded root plus its part list in the visibility API the app talks to. */
export function makeReview({
  root,
  parts,
  bounds,
  sitHeight,
}: {
  root: THREE.Group;
  parts: CadPart[];
  bounds: THREE.Box3;
  sitHeight?: number;
}): CadReview {
  const partByObject = new Map<THREE.Object3D, CadPart>();
  for (const part of parts) {
    // picking walks parents looking for this stamp (see highlights.ts).
    part.object.userData.partId = part.id;
    partByObject.set(part.object, part);
  }

  const setPartVisible = (id: number, visible: boolean) => {
    const part = parts[id];
    if (part) setPickable(part.object, visible);
  };

  const isolate = (id: number) => {
    const sel = parts[id]?.object;
    if (!sel) return;
    for (const part of parts) {
      const obj = part.object;
      setPickable(
        obj,
        obj === sel || isAncestor(obj, sel) || isAncestor(sel, obj)
      );
    }
  };

  const showAll = () => {
    for (const part of parts) setPickable(part.object, true);
  };

  return {
    root,
    sitHeight: sitHeight ?? Math.max(0, -bounds.min.y),
    bounds,
    parts,
    partByObject,
    setPartVisible,
    isolate,
    showAll,
  };
}
