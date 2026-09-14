import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename, join } from "node:path";

import type {
  StepAssemblyNode,
  StepOccurrence,
  StepPackage,
} from "@sfab-bench/contract";

import {
  childLabels,
  componentMatrix,
  labelColor,
  labelEntry,
  labelName,
  readStep,
  referredLabel,
} from "./document";
import { tessellate } from "./mesh";
import { encodeTess } from "./tess";
import type { Label, OpenCascade, Shape } from "./types";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Row-major 4x4 multiply: `parent` applied to `child`. */
function multiply(parent: number[], child: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += parent[row * 4 + k]! * child[k * 4 + col]!;
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

type LeafDefinition = { shape: Shape };

/**
 * Occurrences carry their world transform, not their parent-relative one, and only
 * leaves get an entry: the viewer builds groups from the tree and looks up an
 * occurrence per node, so a flattened leaf transform draws the same scene with
 * fewer entries. That is also what cadgen emitted.
 */
type Walk = {
  occurrences: (StepOccurrence & { definition: string })[];
  definitions: Map<string, LeafDefinition>;
};

function walkLabel(
  oc: OpenCascade,
  colorTool: Parameters<typeof labelColor>[1],
  walk: Walk,
  definition: Label,
  id: string,
  name: string,
  world: number[],
  inheritedColor: number[] | null,
): StepAssemblyNode {
  const shapeTool = oc.XCAFDoc_ShapeTool;
  const isAssembly = shapeTool.IsAssembly(definition);
  const node: StepAssemblyNode = {
    id,
    name,
    nodeType: isAssembly ? "assembly" : "part",
    children: [],
    leafPartIds: [],
  };

  if (isAssembly) {
    const components = childLabels(oc, definition, (child) => shapeTool.IsComponent(child));
    components.forEach((component, index) => {
      const referred = referredLabel(oc, component);
      if (!referred) return;
      const childId = `${id}.${index + 1}`;
      const child = walkLabel(
        oc,
        colorTool,
        walk,
        referred,
        childId,
        labelName(oc, component) ?? labelName(oc, referred) ?? childId,
        multiply(world, componentMatrix(oc, component)),
        labelColor(oc, colorTool, component) ?? inheritedColor,
      );
      node.children.push(child);
      node.leafPartIds.push(...child.leafPartIds);
    });
    return node;
  }

  const entry = labelEntry(oc, definition);
  if (!walk.definitions.has(entry)) {
    walk.definitions.set(entry, { shape: shapeTool.GetShape_2(definition) });
  }
  node.leafPartIds.push(id);
  const color = labelColor(oc, colorTool, definition) ?? inheritedColor;
  walk.occurrences.push({
    id,
    name,
    component: "",
    definition: entry,
    transform: world,
    ...(color ? { color } : {}),
  });
  return node;
}

function worldBounds(
  occurrences: StepOccurrence[],
  bounds: Map<string, { min: number[]; max: number[] }>,
): StepPackage["bbox"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const occurrence of occurrences) {
    const box = bounds.get(occurrence.component);
    if (!box || !Number.isFinite(box.min[0])) continue;
    const m = occurrence.transform;
    for (let corner = 0; corner < 8; corner += 1) {
      const point = [
        corner & 1 ? box.max[0]! : box.min[0]!,
        corner & 2 ? box.max[1]! : box.min[1]!,
        corner & 4 ? box.max[2]! : box.min[2]!,
      ];
      for (let row = 0; row < 3; row += 1) {
        const value =
          m[row * 4]! * point[0]! +
          m[row * 4 + 1]! * point[1]! +
          m[row * 4 + 2]! * point[2]! +
          m[row * 4 + 3]!;
        if (value < min[row]!) min[row] = value;
        if (value > max[row]!) max[row] = value;
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : undefined;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Compile a STEP into the view package at `dest`.
 *
 * The kernel is one single-threaded wasm instance, so builds are serialised here
 * rather than at the call site.
 */
export function buildStepPackage(stepAbs: string, dest: string): Promise<void> {
  const run = queue.then(
    () => build(stepAbs, dest),
    () => build(stepAbs, dest),
  );
  queue = run.catch(() => undefined);
  return run;
}

async function build(stepAbs: string, dest: string): Promise<void> {
  const started = Date.now();
  const document = await readStep(stepAbs);
  const { oc, shapeTool, colorTool } = document;
  try {
    const stem = basename(stepAbs).replace(/\.(step|stp)$/i, "");
    const walk: Walk = { occurrences: [], definitions: new Map() };
    const frees = childLabels(oc, shapeTool.BaseLabel(), (label) =>
      oc.XCAFDoc_ShapeTool.IsFree(label),
    );
    if (!frees.length) throw new Error("STEP has no shapes");

    let root: StepAssemblyNode;
    if (frees.length === 1) {
      root = walkLabel(oc, colorTool, walk, frees[0]!, "o1", stem, IDENTITY, null);
      root.name = stem;
    } else {
      root = { id: "o1", name: stem, nodeType: "assembly", children: [], leafPartIds: [] };
      frees.forEach((free, index) => {
        const child = walkLabel(
          oc,
          colorTool,
          walk,
          free,
          `o1.${index + 1}`,
          labelName(oc, free) ?? `${stem}_${index + 1}`,
          IDENTITY,
          null,
        );
        root.children.push(child);
        root.leafPartIds.push(...child.leafPartIds);
      });
    }

    await rm(dest, { recursive: true, force: true });
    mkdirSync(join(dest, "components"), { recursive: true });

    // Distinct definitions often tessellate to identical meshes (the same bolt placed
    // 40 times arrives as 40 STEP products). Key components by mesh content so the
    // viewer downloads and uploads one geometry, as cadgen's content hash did.
    const components: StepPackage["components"] = {};
    const bounds = new Map<string, { min: number[]; max: number[] }>();
    const componentOf = new Map<string, string>();
    let triangles = 0;
    for (const [entry, definition] of walk.definitions) {
      const mesh = tessellate(oc, definition.shape);
      if (!mesh.indices.length) continue;
      const hash = createHash("sha256");
      for (const array of [mesh.positions, mesh.indices, mesh.faceOrds]) {
        hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
      }
      const id = hash.digest("hex").slice(0, 16);
      componentOf.set(entry, id);
      if (components[id]) continue;
      components[id] = { contentHash: id };
      bounds.set(id, mesh.bounds);
      triangles += mesh.indices.length / 3;
      writeFileSync(join(dest, "components", `${id}.tess`), encodeTess(mesh));
    }

    const occurrences: StepOccurrence[] = [];
    for (const occurrence of walk.occurrences) {
      const component = componentOf.get(occurrence.definition);
      if (!component) continue; // definition had no faces; the tree node stays, empty
      const { definition: _definition, ...rest } = occurrence;
      occurrences.push({ ...rest, component });
    }

    const pkg: StepPackage = {
      // One leaf is a part even when STEP wrapped it in a product structure.
      entryKind: root.leafPartIds.length > 1 ? "assembly" : "part",
      units: "mm",
      label: stem,
      bbox: worldBounds(occurrences, bounds),
      assembly: { root },
      occurrences,
      components,
    };
    writeFileSync(join(dest, "assembly.json"), JSON.stringify(pkg));
    console.log(
      `[occt] ${basename(stepAbs)}: ${occurrences.length} occurrences, ` +
        `${Object.keys(components).length} components, ${triangles} triangles, ${Date.now() - started}ms`,
    );
  } finally {
    document.close();
  }
}
