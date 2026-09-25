import { resolveUrdfMesh, type WorldDocument } from "@sfab-bench/contract";
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

import { projectFileUrl } from "@/cad/loadCadReview";
import { apiFetch } from "@/lib/api";
import { messageFromHttpBody } from "@/lib/load-copy";
import { parseUrdfVisuals } from "@/lib/urdf-visual";

export type WorldMesh =
  | { kind: "stl"; geometry: THREE.BufferGeometry }
  | { kind: "obj"; object: THREE.Object3D };

export type LoadedVisual = {
  robotId: string;
  link: string;
  xyz: [number, number, number];
  rpy: [number, number, number];
  scale: [number, number, number];
  mesh: WorldMesh;
};

export type LoadedWorld = {
  document: WorldDocument;
  visuals: LoadedVisual[];
  /** One entry per acquire. Release each to drop the cache. */
  meshKeys: string[];
  problems: string[];
};

type CacheEntry<T> = {
  refs: number;
  promise: Promise<T>;
};

/** Path alone would reuse bytes after `reloaded`. The revision makes a new entry. */
export function meshCacheKey(rel: string, revision: number): string {
  return `${revision}\0${rel}`;
}

/**
 * `load` runs once per path+revision. Releasing the last ref disposes that
 * entry only, so a newer revision can be on screen before the old one goes.
 */
export function createMeshCache<T>(
  load: (rel: string) => Promise<T>,
  dispose: (value: T) => void
) {
  const cache = new Map<string, CacheEntry<T>>();
  return {
    acquire(rel: string, revision: number): Promise<T> {
      const key = meshCacheKey(rel, revision);
      let entry = cache.get(key);
      if (!entry) {
        let promise: Promise<T>;
        promise = load(rel).catch((err: unknown) => {
          const current = cache.get(key);
          if (current?.promise === promise) cache.delete(key);
          throw err;
        });
        entry = { refs: 0, promise };
        cache.set(key, entry);
      }
      entry.refs += 1;
      return entry.promise;
    },
    release(key: string) {
      const entry = cache.get(key);
      if (!entry) return;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      cache.delete(key);
      void entry.promise.then(dispose).catch(() => {});
    },
  };
}

function disposeMesh(mesh: WorldMesh) {
  if (mesh.kind === "stl") {
    mesh.geometry.dispose();
    return;
  }
  mesh.object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
}

/** Join a path that is relative to `worldRel` (a project-relative world file). */
export function relFromWorldFile(
  worldRel: string,
  rel: string
): string | undefined {
  const world = worldRel.replace(/\\/g, "/").replace(/^\/+/, "");
  const file = rel.replace(/\\/g, "/").trim();
  if (!world || !file || file.startsWith("/") || file.includes(":")) {
    return undefined;
  }
  const slash = world.lastIndexOf("/");
  const anchor =
    slash === -1 ? "_.world.json" : `${world.slice(0, slash)}/_.world.json`;
  return resolveUrdfMesh(anchor, file);
}

async function readFile(rel: string): Promise<Response> {
  const res = await apiFetch(projectFileUrl(rel), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      messageFromHttpBody(text, res.statusText || "Could not load this file")
    );
  }
  return res;
}

function fetchMesh(rel: string): Promise<WorldMesh> {
  if (/\.stl$/i.test(rel)) {
    return readFile(rel).then(async (res) => {
      const geo = new STLLoader().parse(await res.arrayBuffer());
      geo.computeVertexNormals();
      return { kind: "stl", geometry: geo };
    });
  }
  if (/\.obj$/i.test(rel)) {
    return readFile(rel).then(async (res) => {
      const object = new OBJLoader().parse(await res.text());
      return { kind: "obj", object };
    });
  }
  return Promise.reject(new Error(`${rel} is not an STL or OBJ mesh`));
}

const meshes = createMeshCache(fetchMesh, disposeMesh);

export function acquireMesh(rel: string, revision: number): Promise<WorldMesh> {
  return meshes.acquire(rel, revision);
}

export function releaseMesh(key: string) {
  meshes.release(key);
}

export function releaseMeshes(keys: readonly string[]) {
  for (const key of keys) releaseMesh(key);
}

function asDocument(value: unknown): WorldDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<WorldDocument>;
  if (doc.version !== 1 || !Array.isArray(doc.robots)) return null;
  const environment = doc.environment;
  if (!environment || typeof environment !== "object") return null;
  return {
    version: 1,
    robots: doc.robots,
    environment: {
      ground: { plane: Boolean(environment.ground?.plane) },
      primitives: Array.isArray(environment.primitives)
        ? environment.primitives
        : [],
      stepProps: Array.isArray(environment.stepProps)
        ? environment.stepProps
        : [],
    },
    boards: Array.isArray(doc.boards) ? doc.boards : [],
    supplies: Array.isArray(doc.supplies) ? doc.supplies : [],
    parts: Array.isArray(doc.parts) ? doc.parts : [],
    wires: Array.isArray(doc.wires) ? doc.wires : [],
  };
}

export async function loadWorldAssets(
  worldRel: string,
  revision: number
): Promise<LoadedWorld> {
  const res = await readFile(worldRel);
  let parsed: unknown;
  try {
    parsed = (await res.json()) as unknown;
  } catch {
    throw new Error("World file is not JSON.");
  }
  const document = asDocument(parsed);
  if (!document) throw new Error("World file is not a version 1 document.");

  const visuals: LoadedVisual[] = [];
  const meshKeys: string[] = [];
  const problems: string[] = [];

  for (const robot of document.robots) {
    const urdfRel = relFromWorldFile(worldRel, robot.urdf);
    if (!urdfRel) {
      problems.push(`${robot.id}: URDF path "${robot.urdf}" is not usable.`);
      continue;
    }
    let xml: string;
    try {
      xml = await (await readFile(urdfRel)).text();
    } catch (err: unknown) {
      problems.push(
        err instanceof Error
          ? err.message
          : `${robot.id}: could not load the URDF`
      );
      continue;
    }
    for (const visual of parseUrdfVisuals(xml)) {
      const meshRel = resolveUrdfMesh(urdfRel, visual.filename);
      if (!meshRel) {
        problems.push(
          `${robot.id}/${visual.link}: mesh "${visual.filename}" is not a relative path.`
        );
        continue;
      }
      try {
        const mesh = await acquireMesh(meshRel, revision);
        meshKeys.push(meshCacheKey(meshRel, revision));
        visuals.push({
          robotId: robot.id,
          link: visual.link,
          xyz: visual.xyz,
          rpy: visual.rpy,
          scale: visual.scale,
          mesh,
        });
      } catch (err: unknown) {
        problems.push(
          err instanceof Error
            ? err.message
            : `${robot.id}/${visual.link}: could not load ${meshRel}`
        );
      }
    }
  }

  return { document, visuals, meshKeys, problems };
}
