import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { StepAssemblyNode, StepPackage } from "@sfab-bench/contract";

/**
 * Everything a view package has to be true about itself, checked without any
 * reference to what it was built from.
 *
 * That is the point: these run on a file nobody has looked at. A golden package
 * only tells you about the one model it was captured from, and goes stale the
 * moment the tessellator legitimately changes. These hold for every STEP that
 * will ever be opened, so any file at all is a test case.
 */
export type Mesh = {
  header: TessHeader;
  positions: Float32Array;
  normals: Float32Array;
  faceOrds: Float32Array;
  indices: Uint32Array;
};

type TessHeader = {
  positionCount: number;
  normalCount: number;
  faceOrdCount: number;
  indexCount: number;
  sideOrdCount: number;
  edges?: { count: number }[];
  faceRanges: { ord: number; indexStart: number; indexCount: number }[];
};

const TESS_MAGIC = 1397966164; // "TESS"
const TESS_VERSION = 3;

/**
 * The reader half of `apps/web/src/cad/decodeTess.ts`, deliberately written out
 * again rather than shared with the encoder. An encoder checked by its own inverse
 * agrees with itself no matter what it writes; this one agrees with the viewer.
 */
export function decodeTess(source: Buffer | Uint8Array): Mesh {
  // One private copy, so slicing sections below cannot alias a pooled Buffer.
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== TESS_MAGIC)
    throw new Error("not a TESS file");
  if (view.getUint32(4, true) !== TESS_VERSION)
    throw new Error("wrong TESS version");
  const jsonLen = view.getUint32(8, true);
  const text = Buffer.from(bytes.buffer, 12, jsonLen).toString("utf8");
  const header = JSON.parse(text) as TessHeader;

  let offset = 12 + jsonLen;
  const take = <T>(
    Kind: { new (b: ArrayBuffer): T; BYTES_PER_ELEMENT: number },
    count: number
  ): T => {
    const width = Kind.BYTES_PER_ELEMENT * count;
    const start = offset;
    offset += width;
    return new Kind(bytes.buffer.slice(start, start + width));
  };
  const positions = take(Float32Array, header.positionCount);
  const normals = take(Float32Array, header.normalCount);
  const faceOrds = take(Float32Array, header.faceOrdCount);
  const indices = take(Uint32Array, header.indexCount);
  take(Uint32Array, header.sideOrdCount);
  for (const edge of header.edges ?? []) take(Float32Array, edge.count);
  if (offset !== bytes.byteLength) {
    throw new Error(
      `payload is ${bytes.byteLength} bytes, header describes ${offset}`
    );
  }
  return { header, positions, normals, faceOrds, indices };
}

const finite = (values: ArrayLike<number>): boolean => {
  for (let i = 0; i < values.length; i += 1)
    if (!Number.isFinite(values[i]!)) return false;
  return true;
};

/** Depth-first ids of the nodes with no children — the ones that draw geometry. */
function leafIds(node: StepAssemblyNode, out: string[] = []): string[] {
  if (!node.children.length) out.push(node.id);
  for (const child of node.children) leafIds(child, out);
  return out;
}

function checkMesh(
  name: string,
  mesh: Mesh,
  fail: (why: string) => void
): void {
  const { header, positions, normals, faceOrds, indices } = mesh;
  const vertices = positions.length / 3;

  if (!vertices) {
    fail(`${name}: no vertices`);
    return;
  }
  if (!indices.length) {
    fail(`${name}: no triangles`);
    return;
  }
  if (indices.length % 3)
    fail(`${name}: ${indices.length} indices is not whole triangles`);
  if (normals.length !== positions.length)
    fail(
      `${name}: ${normals.length} normals for ${positions.length} position floats`
    );
  if (faceOrds.length !== vertices)
    fail(`${name}: ${faceOrds.length} face ordinals for ${vertices} vertices`);
  if (!finite(positions)) fail(`${name}: a position is NaN or infinite`);
  if (!finite(normals)) fail(`${name}: a normal is NaN or infinite`);

  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i]! >= vertices) {
      fail(`${name}: index ${indices[i]} is outside ${vertices} vertices`);
      break;
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (Math.abs(length - 1) > 1e-3) {
      fail(`${name}: a normal has length ${length.toFixed(4)}, not 1`);
      break;
    }
  }

  // A stored normal has to agree with the winding of the triangle it belongs to.
  // The two are set together in `mesh.ts`, so disagreement means one was flipped
  // without the other — which lights a part inside-out while it still looks solid.
  // Counted rather than absolute: an averaged normal at a cone's apex legitimately
  // leans past 90 degrees from one of the facets meeting there.
  let agree = 0;
  let facets = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3,
      b = indices[i + 1]! * 3,
      c = indices[i + 2]! * 3;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-20) continue; // degenerate sliver
    facets += 1;
    if (nx * normals[a]! + ny * normals[a + 1]! + nz * normals[a + 2]! > 0)
      agree += 1;
  }
  if (facets && agree / facets < 0.95) {
    fail(
      `${name}: ${facets - agree} of ${facets} normals disagree with their triangle's winding`
    );
  }

  // Face ranges must tile the index buffer in order with dense 1-based ordinals.
  // That is the whole basis of a `#o1.2.f7` ref: ordinal 7 is the seventh range.
  let covered = 0;
  header.faceRanges.forEach((range, i) => {
    if (range.ord !== i + 1)
      fail(`${name}: face ordinal ${range.ord} at position ${i + 1}`);
    if (range.indexStart !== covered)
      fail(
        `${name}: face ${range.ord} starts at ${range.indexStart}, not ${covered}`
      );
    if (range.indexCount <= 0)
      fail(`${name}: face ${range.ord} has no triangles`);
    for (
      let k = range.indexStart;
      k < range.indexStart + range.indexCount;
      k += 1
    ) {
      if (faceOrds[indices[k]!] !== range.ord) {
        fail(
          `${name}: a vertex in face ${range.ord} is stamped ${faceOrds[indices[k]!]}`
        );
        break;
      }
    }
    covered += range.indexCount;
  });
  if (covered !== indices.length) {
    fail(`${name}: face ranges cover ${covered} of ${indices.length} indices`);
  }
}

/**
 * Check one built package. Returns every failure rather than throwing at the first,
 * so a broken model reports all of what is wrong with it in one run.
 */
/**
 * Every occurrence's triangles, placed, as one mesh in world millimetres.
 *
 * `occ.transform` is row-major and already flattened to world, the same reading
 * `apps/web/src/cad/loadStepPackage.ts` gives it.
 */
export function placedMesh(
  dir: string,
  pkg: StepPackage
): { positions: Float32Array; indices: Uint32Array } {
  const meshes = new Map<string, Mesh>();
  for (const key of Object.keys(pkg.components)) {
    meshes.set(
      key,
      decodeTess(readFileSync(join(dir, "components", `${key}.tess`)))
    );
  }
  const placed = pkg.occurrences.filter((occ) => meshes.has(occ.component));
  let vertices = 0;
  let indexCount = 0;
  for (const occ of placed) {
    const mesh = meshes.get(occ.component)!;
    vertices += mesh.positions.length / 3;
    indexCount += mesh.indices.length;
  }

  const positions = new Float32Array(vertices * 3);
  const indices = new Uint32Array(indexCount);
  let base = 0;
  let at = 0;
  for (const occ of placed) {
    const mesh = meshes.get(occ.component)!;
    const t = occ.transform;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      for (let row = 0; row < 3; row += 1) {
        positions[base * 3 + i + row] =
          t[row * 4]! * x +
          t[row * 4 + 1]! * y +
          t[row * 4 + 2]! * z +
          t[row * 4 + 3]!;
      }
    }
    for (let i = 0; i < mesh.indices.length; i += 1)
      indices[at + i] = mesh.indices[i]! + base;
    base += mesh.positions.length / 3;
    at += mesh.indices.length;
  }
  return { positions, indices };
}

export function checkPackage(dir: string): string[] {
  const failures: string[] = [];
  const fail = (why: string) => failures.push(why);

  let pkg: StepPackage;
  try {
    pkg = JSON.parse(
      readFileSync(join(dir, "assembly.json"), "utf8")
    ) as StepPackage;
  } catch (err) {
    return [
      `assembly.json is unreadable: ${err instanceof Error ? err.message : String(err)}`,
    ];
  }

  const root = pkg.assembly?.root;
  if (!root) return ["package has no assembly root"];

  // --- the tree and the occurrences have to describe the same model -----------
  const byId = new Map(pkg.occurrences.map((occ) => [occ.id, occ]));
  if (byId.size !== pkg.occurrences.length) fail("two occurrences share an id");

  const leaves = leafIds(root);
  for (const id of leaves) {
    // A leaf with no occurrence is a part the viewer draws nothing for. The one
    // legitimate case is a definition that tessellated to nothing at all.
    if (!byId.has(id)) fail(`leaf node ${id} has no occurrence`);
  }
  const listed = [...root.leafPartIds].sort().join(",");
  if (listed !== [...leaves].sort().join(",")) {
    fail(
      `leafPartIds does not match the tree's leaves (${root.leafPartIds.length} vs ${leaves.length})`
    );
  }

  for (const occ of pkg.occurrences) {
    if (occ.transform.length !== 16)
      fail(`${occ.id}: transform has ${occ.transform.length} numbers`);
    else if (!finite(occ.transform))
      fail(`${occ.id}: transform is NaN or infinite`);
    else {
      const bottom = [
        occ.transform[12]!,
        occ.transform[13]!,
        occ.transform[14]!,
        occ.transform[15]!,
      ];
      if (bottom.slice(0, 3).some((v) => v !== 0) || bottom[3] !== 1) {
        fail(
          `${occ.id}: transform is not affine (bottom row ${bottom.join(",")})`
        );
      }
    }
    if (occ.color) {
      if (occ.color.length !== 4)
        fail(`${occ.id}: colour has ${occ.color.length} channels`);
      else if (occ.color.some((v) => !(v >= 0 && v <= 1)))
        fail(`${occ.id}: colour is outside 0..1`);
    }
    if (!pkg.components[occ.component])
      fail(`${occ.id}: no component ${occ.component}`);
  }

  // --- the component keys and the files on disk have to be the same set -------
  let onDisk: string[] = [];
  try {
    onDisk = readdirSync(join(dir, "components"))
      .filter((f) => f.endsWith(".tess"))
      .map((f) => f.slice(0, -5));
  } catch {
    return [...failures, "package has no components/ directory"];
  }
  const keys = Object.keys(pkg.components);
  for (const key of keys)
    if (!onDisk.includes(key)) fail(`component ${key} has no .tess file`);
  for (const file of onDisk)
    if (!keys.includes(file)) fail(`${file}.tess belongs to no component`);

  // --- every mesh has to be drawable ------------------------------------------
  const meshes = new Map<string, Mesh>();
  for (const key of keys) {
    if (!onDisk.includes(key)) continue;
    try {
      const mesh = decodeTess(
        readFileSync(join(dir, "components", `${key}.tess`))
      );
      meshes.set(key, mesh);
      checkMesh(key, mesh, fail);
    } catch (err) {
      fail(`${key}.tess: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- the declared bbox has to be where the geometry actually is -------------
  if (pkg.bbox) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const occ of pkg.occurrences) {
      const mesh = meshes.get(occ.component);
      if (!mesh) continue;
      const m = occ.transform;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i]!,
          y = mesh.positions[i + 1]!,
          z = mesh.positions[i + 2]!;
        for (let row = 0; row < 3; row += 1) {
          const v =
            m[row * 4]! * x +
            m[row * 4 + 1]! * y +
            m[row * 4 + 2]! * z +
            m[row * 4 + 3]!;
          if (v < min[row]!) min[row] = v;
          if (v > max[row]!) max[row] = v;
        }
      }
    }
    // A loose tolerance on purpose: the declared box is computed from per-component
    // boxes, so a rotated part legitimately makes it larger than the tight one.
    for (let row = 0; row < 3; row += 1) {
      if (
        pkg.bbox.min[row]! > min[row]! + 1e-3 ||
        pkg.bbox.max[row]! < max[row]! - 1e-3
      ) {
        fail(
          `bbox axis ${row} claims ${pkg.bbox.min[row]}..${pkg.bbox.max[row]} but geometry spans ${min[row]}..${max[row]}`
        );
      }
    }
  }

  return failures;
}
