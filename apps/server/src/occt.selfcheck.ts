import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StepPackage } from "@sfab-bench/contract";

import { buildStepPackage } from "./occt/package";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

/** The reader half of apps/web/src/cad/decodeTess.ts, so the check sees what the viewer sees. */
function decodeTess(bytes: Buffer) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true) === 1397966164, "tess magic is TESS");
  expect(view.getUint32(4, true) === 3, "tess version is 3");
  const jsonLen = view.getUint32(8, true);
  const header = JSON.parse(bytes.subarray(12, 12 + jsonLen).toString("utf8")) as {
    positionCount: number;
    normalCount: number;
    faceOrdCount: number;
    indexCount: number;
    sideOrdCount: number;
    edges: { count: number }[];
    faceRanges: { ord: number; indexStart: number; indexCount: number }[];
  };
  let offset = 12 + jsonLen;
  const takeF32 = (count: number) => {
    const out = new Float32Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + count * 4));
    offset += count * 4;
    return out;
  };
  const takeU32 = (count: number) => {
    const out = new Uint32Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + count * 4));
    offset += count * 4;
    return out;
  };
  const positions = takeF32(header.positionCount);
  const normals = takeF32(header.normalCount);
  const faceOrds = takeF32(header.faceOrdCount);
  const indices = takeU32(header.indexCount);
  takeU32(header.sideOrdCount);
  for (const edge of header.edges ?? []) takeF32(edge.count);
  expect(offset === bytes.length, "tess payload is exactly as long as its header says");
  return { header, positions, normals, faceOrds, indices };
}

const fixture = fileURLToPath(new URL("../fixtures/bracket_assembly.step", import.meta.url));
const dest = mkdtempSync(join(tmpdir(), "sfab-occt-"));

await buildStepPackage(fixture, dest);

const pkg = JSON.parse(readFileSync(join(dest, "assembly.json"), "utf8")) as StepPackage;

expect(pkg.entryKind === "assembly", "fixture reads back as an assembly");
expect(pkg.units === "mm", "units are millimetres");
expect(pkg.label === "bracket_assembly", "label comes from the file stem");

const root = pkg.assembly?.root;
expect(root, "package has an assembly root");
expect(root!.children.length === 3, "root has the three components it was built with");
expect(root!.leafPartIds.length === 3, "root lists every leaf part");

const names = root!.children.map((child) => child.name);
expect(names.includes("plate_1"), "component names survive the round trip");
expect(names.includes("post_left") && names.includes("post_right"), "both posts are named");

expect(pkg.occurrences.length === 3, "one occurrence per leaf");
const ids = new Set(pkg.occurrences.map((occ) => occ.id));
expect(ids.size === 3, "occurrence ids are unique");
for (const occ of pkg.occurrences) {
  expect(occ.transform.length === 16, `${occ.id} carries a 4x4`);
  expect(occ.color?.length === 4, `${occ.id} kept its colour`);
  expect(pkg.components[occ.component], `${occ.id} points at a component`);
}

// The two posts are the same solid placed twice: one component, two occurrences.
expect(Object.keys(pkg.components).length === 2, "identical geometry collapses to one component");
const posts = pkg.occurrences.filter((occ) => occ.name.startsWith("post_"));
expect(posts.length === 2 && posts[0]!.component === posts[1]!.component, "both posts share geometry");
expect(posts[0]!.transform[3] !== posts[1]!.transform[3], "the posts sit at different places");

const plate = pkg.occurrences.find((occ) => occ.name === "plate_1");
expect(plate && plate.component !== posts[0]!.component, "plate is its own component");

const bbox = pkg.bbox;
expect(bbox, "package has a bounding box");
expect(Math.abs(bbox!.min[0]) < 0.1 && Math.abs(bbox!.max[0] - 60) < 0.5, "bbox spans the 60mm plate");

const tessFiles = readdirSync(join(dest, "components")).filter((f) => f.endsWith(".tess"));
expect(tessFiles.length === 2, "one .tess per component");

for (const file of tessFiles) {
  const mesh = decodeTess(readFileSync(join(dest, "components", file)));
  const { header, positions, normals, faceOrds, indices } = mesh;
  expect(positions.length > 0 && indices.length > 0, `${file} has geometry`);
  expect(normals.length === positions.length, `${file} has one normal per position`);
  expect(faceOrds.length === positions.length / 3, `${file} has one face ordinal per vertex`);
  expect(indices.length % 3 === 0, `${file} indices are whole triangles`);

  let max = 0;
  for (const index of indices) if (index > max) max = index;
  expect(max < positions.length / 3, `${file} indices stay inside the vertex array`);

  // Face ranges must tile the index buffer in order: that is what turns a picked
  // triangle into a stable `#o….f7` ref.
  let covered = 0;
  header.faceRanges.forEach((range, i) => {
    expect(range.indexStart === covered, `${file} face ${range.ord} starts where the last one ended`);
    expect(range.indexCount > 0, `${file} face ${range.ord} has triangles`);
    expect(range.ord === i + 1, `${file} face ordinals are 1-based and dense`);
    covered += range.indexCount;
    for (let k = range.indexStart; k < range.indexStart + range.indexCount; k += 1) {
      expect(faceOrds[indices[k]!] === range.ord, `${file} vertex ordinals agree with face ${range.ord}`);
    }
  });
  expect(covered === indices.length, `${file} face ranges cover every index`);

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    expect(Math.abs(length - 1) < 1e-3, `${file} normals are unit length`);
  }

  // Both fixture parts are convex, so every normal must point away from the centroid.
  // This is the cheap way to catch flipped winding or a missed REVERSED face, which
  // otherwise only shows up as a part that renders inside-out.
  let cx = 0, cy = 0, cz = 0;
  const vertices = positions.length / 3;
  for (let i = 0; i < positions.length; i += 3) {
    cx += positions[i]!;
    cy += positions[i + 1]!;
    cz += positions[i + 2]!;
  }
  cx /= vertices; cy /= vertices; cz /= vertices;
  let outward = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dot =
      normals[i]! * (positions[i]! - cx) +
      normals[i + 1]! * (positions[i + 1]! - cy) +
      normals[i + 2]! * (positions[i + 2]! - cz);
    if (dot > 0) outward += 1;
  }
  expect(outward / vertices > 0.95, `${file} normals point outward (${outward}/${vertices})`);
}

rmSync(dest, { recursive: true, force: true });
console.log("occt.selfcheck ok");
