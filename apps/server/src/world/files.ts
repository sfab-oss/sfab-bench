import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import {
  extractUrdfJointsAndMeshes,
  resolveUrdfMesh,
} from "@sfab-bench/contract";

/**
 * Same containment rule as `projects.insideRoot`. This file does not import
 * `projects`: the world worker loads it, and `projects` opens sqlite.
 */
function insideRoot(root: string, abs: string): boolean {
  const rel = relative(resolve(root), abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function projectReal(root: string): string | null {
  try {
    return realpathSync(root);
  } catch {
    return null;
  }
}

/** A project-relative file that stays inside `rootReal` after symlink resolution. */
export function resolveInside(rootReal: string, rel: string): string | null {
  const clean = rel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").includes("..") || isAbsolute(clean)) {
    return null;
  }
  const abs = resolve(rootReal, clean);
  if (!existsSync(abs)) return null;
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return null;
  }
  if (!insideRoot(rootReal, real)) return null;
  if (!statSync(real).isFile()) return null;
  return real;
}

export function readInside(rootReal: string, rel: string): Uint8Array | null {
  const abs = resolveInside(rootReal, rel);
  if (!abs) return null;
  try {
    return new Uint8Array(readFileSync(abs));
  } catch {
    return null;
  }
}

export function parentRel(rel: string): string {
  const clean = rel.replace(/\\/g, "/");
  const slash = clean.lastIndexOf("/");
  return slash === -1 ? "" : clean.slice(0, slash);
}

/** Join two relative paths. `..` is rejected rather than normalised away. */
export function joinRel(dir: string, rel: string): string | null {
  const parts: string[] = [];
  for (const part of `${dir}/${rel}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  if (parts.length === 0) return null;
  return parts.join("/");
}

/**
 * Bytes relative to the world file. The document's URDF and firmware paths
 * are written that way; mesh paths are relative to the URDF, and the model
 * builder joins those itself before asking.
 */
export type WorldBytes = {
  read(relativeToWorld: string): Uint8Array | null;
};

export function readerFor(rootReal: string, worldRel: string): WorldBytes {
  const dir = parentRel(worldRel);
  return {
    read(rel: string) {
      const full = joinRel(dir, rel);
      if (!full) return null;
      return readInside(rootReal, full);
    },
  };
}

export function fileStamp(abs: string): string {
  try {
    const st = statSync(abs);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

/**
 * Project-relative paths the run depends on: the world file, each URDF,
 * and each mesh filename resolved from that URDF. Firmware is a board
 * input and does not rebuild the physics.
 */
export function dependencyRels(rootReal: string, worldRel: string): string[] {
  const rels = [worldRel];
  const worldAbs = resolveInside(rootReal, worldRel);
  if (!worldAbs) return rels;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(worldAbs, "utf8")) as unknown;
  } catch {
    return rels;
  }
  if (!parsed || typeof parsed !== "object") return rels;
  const robots = (parsed as { robots?: unknown }).robots;
  if (!Array.isArray(robots)) return rels;
  const worldDir = parentRel(worldRel);
  for (const robot of robots) {
    if (!robot || typeof robot !== "object") continue;
    const urdf = (robot as { urdf?: unknown }).urdf;
    if (typeof urdf !== "string") continue;
    const urdfRel = joinRel(worldDir, urdf);
    if (!urdfRel) continue;
    rels.push(urdfRel);
    const urdfAbs = resolveInside(rootReal, urdfRel);
    if (!urdfAbs) continue;
    let xml = "";
    try {
      xml = readFileSync(urdfAbs, "utf8");
    } catch {
      continue;
    }
    for (const mesh of extractUrdfJointsAndMeshes(xml).meshes) {
      const meshRel = resolveUrdfMesh(urdfRel, mesh);
      if (meshRel) rels.push(meshRel);
    }
  }
  return rels;
}

export type FirmwareWatch = {
  id: string;
  /** Project-relative `.hex` path. */
  rel: string;
  stamp: string;
};

/** Board firmware images. A change restarts that board and not the physics. */
export function firmwareWatch(
  rootReal: string,
  worldRel: string
): FirmwareWatch[] {
  const worldAbs = resolveInside(rootReal, worldRel);
  if (!worldAbs) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(worldAbs, "utf8")) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const boards = (parsed as { boards?: unknown }).boards;
  if (!Array.isArray(boards)) return [];
  const worldDir = parentRel(worldRel);
  const out: FirmwareWatch[] = [];
  for (const item of boards) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const firmware = (item as { firmware?: unknown }).firmware;
    if (typeof id !== "string" || typeof firmware !== "string") continue;
    const rel = joinRel(worldDir, firmware);
    if (!rel) continue;
    const abs = resolveInside(rootReal, rel);
    out.push({ id, rel, stamp: abs ? fileStamp(abs) : "missing" });
  }
  return out;
}

export function dependencyStamp(rootReal: string, rels: string[]): string {
  return rels
    .map((rel) => {
      const abs = resolveInside(rootReal, rel);
      return `${rel}=${abs ? fileStamp(abs) : "missing"}`;
    })
    .join("|");
}
