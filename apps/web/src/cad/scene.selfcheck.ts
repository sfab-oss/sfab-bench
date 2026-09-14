import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";

import type { StepAssemblyNode, StepPackage } from "@sfab-bench/contract";
import { buildStepPackage } from "@sfab-bench/server/occt";

import { decodeTess, type ComponentMesh } from "@/cad/decodeTess";
import { pickAlongRay } from "@/cad/highlights";
import { buildScene } from "@/cad/loadStepPackage";
import type { CadReview } from "@/cad/review";

/**
 * Tier 4a — the scene, not the package.
 *
 * `occt.corpus.selfcheck.ts` proves the triangles match the surfaces they came
 * from. Everything after that is `buildScene`: millimetres become metres, CAD
 * Z-up becomes three Y-up, and a ray becomes an `#o1.2.f7` an assistant is handed
 * and then acts on. None of that is covered by a check on the package, and all of
 * it is plain arithmetic on objects — no GPU, no canvas, no jsdom.
 *
 * Every fixture is built here rather than read from a committed package, so this
 * never asserts against a golden that could rot into agreement with a bug.
 */

const fixtures = fileURLToPath(new URL("../../../server/fixtures/", import.meta.url));
const failures: string[] = [];
const note = (why: string) => {
  failures.push(why);
  console.error(`  ✗ ${why}`);
};
const near = (got: number, want: number, eps: number) => Math.abs(got - want) <= eps;

type Loaded = {
  review: CadReview;
  assembly: StepPackage;
  /** `root` under the floor offset, exactly as `scene/CadModel.tsx` mounts it. */
  world: THREE.Group;
};

/** Build a fixture and assemble it the way the viewer does. */
async function load(name: string): Promise<Loaded> {
  const dest = mkdtempSync(join(tmpdir(), "sfab-scene-"));
  try {
    await buildStepPackage(join(fixtures, `${name}.step`), dest);
    const assembly = JSON.parse(readFileSync(join(dest, "assembly.json"), "utf8")) as StepPackage;
    const meshes = new Map<string, ComponentMesh>();
    for (const cid of new Set(assembly.occurrences.map((occ) => occ.component))) {
      const bytes = readFileSync(join(dest, "components", `${cid}.tess`));
      meshes.set(cid, decodeTess(new Uint8Array(bytes)));
    }
    const review = buildScene(assembly, meshes);
    const world = new THREE.Group();
    world.position.y = review.sitHeight;
    world.add(review.root);
    world.updateMatrixWorld(true);
    return { review, assembly, world };
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

/** A ray aimed at `target` from `dir` away, far enough out to start outside anything. */
function rayFrom(target: THREE.Vector3, dir: THREE.Vector3): THREE.Ray {
  const from = target.clone().addScaledVector(dir, 1);
  return new THREE.Ray(from, dir.clone().negate());
}

/**
 * Aim points: the middle of each part that has geometry, at most this many, so
 * `many_instances` costs six rays a part rather than 720.
 */
function targets(review: CadReview): { ref: string; at: THREE.Vector3 }[] {
  const out: { ref: string; at: THREE.Vector3 }[] = [];
  for (const part of review.parts) {
    if (out.length >= 8) break;
    let meshy = false;
    part.object.traverse((child) => {
      if (child instanceof THREE.Mesh) meshy = true;
    });
    if (!meshy) continue;
    const at = new THREE.Box3().setFromObject(part.object).getCenter(new THREE.Vector3());
    out.push({ ref: part.cadRef ?? part.name, at });
  }
  return out;
}

const AXES: [string, THREE.Vector3][] = [
  ["+x", new THREE.Vector3(1, 0, 0)],
  ["-x", new THREE.Vector3(-1, 0, 0)],
  ["+y", new THREE.Vector3(0, 1, 0)],
  ["-y", new THREE.Vector3(0, -1, 0)],
  ["+z", new THREE.Vector3(0, 0, 1)],
  ["-z", new THREE.Vector3(0, 0, -1)],
];

// ---------------------------------------------------------------------------
// Units and up-axis
// ---------------------------------------------------------------------------

/**
 * `inch_block` is 2 x 1 x 0.5 inches, which OCCT converts to 50.8 x 25.4 x 12.7 mm
 * on the way in. In the scene that must come out as metres with CAD Z as three Y:
 * the 12.7mm thickness is the model's *height*. Get the rotation wrong and the
 * numbers are all still there, just on the wrong axes — which on a monitor reads
 * as "the model is lying down", and in VR as a wall.
 */
{
  const { review } = await load("inch_block");
  const size = review.bounds.getSize(new THREE.Vector3());
  const want: [string, number, number][] = [
    ["x (CAD X, 50.8mm)", size.x, 0.0508],
    ["y (CAD Z, 12.7mm)", size.y, 0.0127],
    ["z (CAD Y, 25.4mm)", size.z, 0.0254],
  ];
  for (const [label, got, expected] of want) {
    if (!near(got, expected, 1e-5)) {
      note(`inch_block: world size ${label} is ${got.toFixed(5)}m, expected ${expected}m`);
    }
  }
}

// ---------------------------------------------------------------------------
// The floor, every ref, and picking, across the whole corpus
// ---------------------------------------------------------------------------

const names = ["inch_block", "bracket_assembly", "curved_solids", "deep_nest", "bare_solids", "many_instances", "cut_solid"];
const scenes = new Map<string, Loaded>();
for (const name of names) scenes.set(name, await load(name));

for (const [name, { review, assembly, world }] of scenes) {
  const box = new THREE.Box3().setFromObject(world);

  /**
   * `sitHeight` lifts the model onto the floor. Sunk into it is the failure that
   * matters: in VR you cannot walk round the half that is under the ground.
   */
  if (box.min.y < -1e-6) {
    note(`${name}: sits ${(-box.min.y * 1000).toFixed(2)}mm below the floor`);
  }
  // A model already clear of the floor is left where the CAD put it.
  if (review.bounds.min.y < 0 && !near(box.min.y, 0, 1e-6)) {
    note(`${name}: floor offset left it ${(box.min.y * 1000).toFixed(2)}mm off the ground`);
  }
  if (review.bounds.min.y >= 0 && review.sitHeight !== 0) {
    note(`${name}: raised by ${review.sitHeight}m though it was already above the floor`);
  }

  /**
   * A `cadRef` is a name an assistant is given and then sends back. Two parts
   * answering to one ref means `show_artifact` can highlight the wrong thing, and
   * a ref naming nothing in the package means it can highlight nothing at all.
   */
  const known = new Set<string>(assembly.occurrences.map((occ) => occ.id));
  const walk = (node: StepAssemblyNode) => {
    known.add(node.id);
    for (const child of node.children) walk(child);
  };
  if (assembly.assembly?.root) walk(assembly.assembly.root);

  const seen = new Set<string>();
  for (const part of review.parts) {
    if (!part.cadRef) {
      note(`${name}: part "${part.name}" has no cadRef`);
      continue;
    }
    if (seen.has(part.cadRef)) note(`${name}: ${part.cadRef} names more than one part`);
    seen.add(part.cadRef);
    if (!known.has(part.cadRef.slice(1))) {
      note(`${name}: ${part.cadRef} is not in the package`);
    }
  }

  /**
   * Six rays at each part from outside. Aimed at parts rather than at the model,
   * because the middle of a bounding box is not reliably inside anything — in
   * `many_instances` it is the gap between two of the 120 placements.
   *
   * Whatever a ray hits, the ref has to be one the package can explain and the
   * surface normal has to face the ray. That last one is worth stating plainly:
   * CAD materials ship as `DoubleSide`, so a part built inside out draws exactly
   * as if it were fine, and a normal turned away from the ray is the only sign.
   */
  for (const target of targets(review)) {
    let hits = 0;
    for (const [label, dir] of AXES) {
      const pick = pickAlongRay(review, rayFrom(target.at, dir));
      if (!pick) continue;
      hits += 1;
      const ref = pick.cadRef.replace(/\.f\d+$/, "");
      if (!known.has(ref.slice(1))) note(`${name}: pick from ${label} returned ${pick.cadRef}, not in the package`);
      // Strictly positive, not comfortably so: a ray down a cone's axis lands on
      // its flank, where the outward normal is nearly side-on. Reversed is the bug.
      if (pick.normal.dot(dir) <= 0.01) {
        note(
          `${name}: the face picked from ${label} points away from the ray ` +
            `(${pick.normal.toArray().map((n) => n.toFixed(2)).join(",")})`,
        );
      }
      if (!box.containsPoint(pick.point)) note(`${name}: pick from ${label} landed outside the model's own box`);
    }
    // A torus loses the two rays down its hole; nothing loses all six.
    if (!hits) note(`${name}: ${target.ref} was not picked from any of the six axes`);
  }
}

// ---------------------------------------------------------------------------
// Face refs
// ---------------------------------------------------------------------------

/**
 * A box has six faces. This is the one place the corpus can state the whole right
 * answer for a `#o….fN`, so it states it: six rays, six *different* ordinals,
 * drawn from exactly 1..6 with nothing repeated and nothing missing.
 *
 * The ordinal is what `get_viewer` hands over and what the assistant then names
 * back. If two faces collapse onto one ordinal, an agent asked to act on the top
 * of a plate can silently act on its underside.
 */
{
  const { review, world } = scenes.get("inch_block")!;
  const box = new THREE.Box3().setFromObject(world);
  const centre = box.getCenter(new THREE.Vector3());
  const ords = new Map<string, number>();
  for (const [label, dir] of AXES) {
    const pick = pickAlongRay(review, rayFrom(centre, dir));
    const ord = Number(/\.f(\d+)$/.exec(pick?.cadRef ?? "")?.[1]);
    if (!pick || !Number.isFinite(ord)) {
      note(`inch_block: the face from ${label} came back as ${pick?.cadRef ?? "nothing"}, with no ordinal`);
      continue;
    }
    ords.set(label, ord);
  }
  const distinct = new Set(ords.values());
  if (distinct.size !== 6) {
    note(`inch_block: six faces picked, ${distinct.size} distinct ordinals — ${[...ords].map(([k, v]) => `${k}=f${v}`).join(" ")}`);
  }
  for (const ord of distinct) {
    if (ord < 1 || ord > 6) note(`inch_block: face ordinal f${ord} is outside the 1..6 a box has`);
  }

  /**
   * One flat face, four corners of it: the same physical surface must answer to
   * the same ordinal wherever it is touched, or a ref means only "where the mouse
   * happened to be" and cannot be handed to anything.
   */
  const top = box.max.y;
  const inset = 0.2;
  const corners: [number, number][] = [
    [inset, inset],
    [1 - inset, inset],
    [inset, 1 - inset],
    [1 - inset, 1 - inset],
  ];
  const onTop = new Set<string>();
  for (const [u, v] of corners) {
    const at = new THREE.Vector3(
      THREE.MathUtils.lerp(box.min.x, box.max.x, u),
      top,
      THREE.MathUtils.lerp(box.min.z, box.max.z, v),
    );
    const pick = pickAlongRay(review, rayFrom(at, new THREE.Vector3(0, 1, 0)));
    onTop.add(pick?.cadRef ?? "nothing");
  }
  if (onTop.size !== 1) {
    note(`inch_block: four points on the top face gave ${onTop.size} different refs — ${[...onTop].join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// The same file twice
// ---------------------------------------------------------------------------

/**
 * Determinism of the *package* is checked server-side. This is the other half:
 * the same file, built and assembled again, has to answer the same ray with the
 * same ref. A ref that drifts between two opens of one unchanged file is a
 * conversation where the assistant and the user are looking at different faces.
 */
for (const name of ["inch_block", "bracket_assembly", "cut_solid"]) {
  const first = scenes.get(name)!;
  const again = await load(name);
  const box = new THREE.Box3().setFromObject(first.world);
  const centre = box.getCenter(new THREE.Vector3());
  for (const [label, dir] of AXES) {
    const a = pickAlongRay(first.review, rayFrom(centre, dir))?.cadRef ?? "nothing";
    const b = pickAlongRay(again.review, rayFrom(centre, dir))?.cadRef ?? "nothing";
    if (a !== b) note(`${name}: rebuilding moved the ref from ${label} — ${a} became ${b}`);
  }
}

if (failures.length) throw new Error(`${failures.length} scene failure(s) across ${names.length} fixtures`);
console.log(`scene.selfcheck ok (${names.length} fixtures)`);
