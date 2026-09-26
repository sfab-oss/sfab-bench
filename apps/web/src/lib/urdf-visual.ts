/**
 * Visual meshes on a URDF link: filename, origin, and scale.
 *
 * Same constraints as the contract scanner: no DOM. Comments are dropped,
 * then tags are walked so an `<origin>` inside `<collision>` or `<inertial>`
 * is not the visual's. Paths are returned as written.
 */

import { attr } from "@sfab-bench/contract";

export type UrdfVec3 = [number, number, number];

export type UrdfVisual = {
  link: string;
  /** Mesh filename as written, relative to the URDF. */
  filename: string;
  /** `<origin xyz>`. Metres. Missing origin is the identity. */
  xyz: UrdfVec3;
  /** `<origin rpy>` in radians: roll, pitch, yaw. Fixed axis R = Rz(yaw)·Ry(pitch)·Rx(roll). */
  rpy: UrdfVec3;
  /** `<mesh scale>`. Missing scale is 1 1 1. */
  scale: UrdfVec3;
};

const IDENTITY: UrdfVec3 = [0, 0, 0];
const UNIT: UrdfVec3 = [1, 1, 1];

function vec3(text: string | undefined, fallback: UrdfVec3): UrdfVec3 {
  if (!text) return fallback;
  const parts = text
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));
  if (parts.length === 1 && Number.isFinite(parts[0])) {
    const n = parts[0] ?? 0;
    return [n, n, n];
  }
  if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  return fallback;
}

type OpenVisual = {
  xyz: UrdfVec3;
  rpy: UrdfVec3;
  meshes: { filename: string; scale: UrdfVec3 }[];
};

/**
 * One entry per `<visual>` mesh. Collision geometry is ignored. A visual
 * with no mesh (a primitive) is ignored: milestone 1 link geometry is STL
 * or OBJ.
 */
export function parseUrdfVisuals(xml: string): UrdfVisual[] {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const visuals: UrdfVisual[] = [];
  let link: string | null = null;
  let visual: OpenVisual | null = null;

  for (const tag of stripped.matchAll(
    /<(\/)?([A-Za-z][\w:.-]*)\b([^>]*?)(\/)?>/g
  )) {
    const closing = Boolean(tag[1]);
    const element = tag[2] ?? "";
    const attrs = tag[3] ?? "";
    const selfClosing = Boolean(tag[4]);

    if (closing) {
      if (element === "visual" && visual && link) {
        for (const mesh of visual.meshes) {
          visuals.push({
            link,
            filename: mesh.filename,
            xyz: visual.xyz,
            rpy: visual.rpy,
            scale: mesh.scale,
          });
        }
      }
      if (element === "visual") visual = null;
      if (element === "link") link = null;
      continue;
    }

    if (element === "link") {
      link = attr(attrs, "name") ?? null;
    } else if (element === "visual" && link && !visual) {
      visual = { xyz: IDENTITY, rpy: IDENTITY, meshes: [] };
    } else if (element === "origin" && visual) {
      visual.xyz = vec3(attr(attrs, "xyz"), IDENTITY);
      visual.rpy = vec3(attr(attrs, "rpy"), IDENTITY);
    } else if (element === "mesh" && visual) {
      const filename = attr(attrs, "filename");
      if (filename) {
        visual.meshes.push({
          filename,
          scale: vec3(attr(attrs, "scale"), UNIT),
        });
      }
    }

    if (selfClosing && element === "visual") visual = null;
    if (selfClosing && element === "link") link = null;
  }

  return visuals;
}
