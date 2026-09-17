import type { ViewerSketch } from "@sfab-bench/contract";
import * as THREE from "three";

import { pickAlongRay } from "@/cad/highlights";
import type { CadReview } from "@/cad/review";

/** Minimum wrap-local metres between kept samples. 4 mm. */
export const SKETCH_MIN_STEP_M = 0.004;
/** Drop a stroke shorter than this. 2 mm. */
export const SKETCH_MIN_LENGTH_M = 0.002;
export const SKETCH_MAX_POINTS = 200;
/** First-sample snap radius in world metres. 8 mm. */
export const SKETCH_SNAP_M = 0.008;

export type SketchStroke = {
  id: string;
  file: string;
  on: string | null;
  points: [number, number, number][];
};

const AXES: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const probeRay = new THREE.Ray();
const planeN = new THREE.Vector3();
const planeDelta = new THREE.Vector3();

export function strokeLengthM(points: [number, number, number][]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    n += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return n;
}

export function shouldKeepStroke(stroke: SketchStroke): boolean {
  return (
    stroke.points.length >= 2 &&
    strokeLengthM(stroke.points) >= SKETCH_MIN_LENGTH_M
  );
}

export function shouldAppendPoint(
  points: [number, number, number][],
  next: [number, number, number]
): boolean {
  if (points.length >= SKETCH_MAX_POINTS) return false;
  const last = points.at(-1);
  if (!last) return true;
  return (
    Math.hypot(next[0] - last[0], next[1] - last[1], next[2] - last[2]) >=
    SKETCH_MIN_STEP_M
  );
}

export function projectOnPlane(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  out = new THREE.Vector3()
): THREE.Vector3 {
  planeN.copy(normal).normalize();
  const d = planeDelta.subVectors(point, origin).dot(planeN);
  return out.copy(point).addScaledVector(planeN, -d);
}

/** Closest face within `radius` of a world-space tip, or undefined (air).
 * v1 only probes the six world axes; an off-axis face inside the radius can miss. */
export function probeFaceNear(
  review: CadReview,
  worldPoint: THREE.Vector3,
  radius = SKETCH_SNAP_M
): ReturnType<typeof pickAlongRay> {
  let best: ReturnType<typeof pickAlongRay>;
  let bestD = radius;
  for (const [x, y, z] of AXES) {
    probeRay.origin.copy(worldPoint);
    probeRay.direction.set(x, y, z);
    const hit = pickAlongRay(review, probeRay);
    if (!hit) continue;
    const d = hit.point.distanceTo(worldPoint);
    if (d <= bestD) {
      bestD = d;
      best = hit;
    }
  }
  return best;
}

export function toViewerSketch(stroke: SketchStroke): ViewerSketch {
  return {
    id: stroke.id,
    kind: "stroke",
    file: stroke.file,
    on: stroke.on,
    mm: stroke.points.map(([x, y, z]) => [x * 1000, y * 1000, z * 1000]),
    lengthMm: strokeLengthM(stroke.points) * 1000,
  };
}
