import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StepPackage } from "@sfab-bench/contract";

import { buildStepPackage } from "./occt/build";
import { checkPackage, placedMesh } from "./occt/invariants";
import { readStep, childLabels } from "./occt/document";
import { meshProps, solidProps } from "./occt/solid";
import { briefError } from "./occt/runtime";

/**
 * The generated corpus against real CAD.
 *
 * `pnpm corpus:fetch` downloads it; nothing here is in the repo. On a clean clone
 * this prints "skipped" and passes, which is deliberate — the suite must never
 * depend on someone else's server being up — so it is not part of `pnpm test`.
 * Run it with `pnpm corpus:external` after fetching.
 *
 * What it asserts is narrower than the generated corpus on purpose. Tiers 0 and 1
 * apply to any file at all: it must open without crashing or hanging, and the
 * package it produces must not contradict itself. Those are hard failures.
 *
 * Tier 2 is *reported and not enforced*. The divergence theorem needs a closed,
 * consistently wound surface, and a real export often is not one — open shells,
 * surface-only bodies and tessellated geometry are all legitimate STEP and all
 * make the volume comparison meaningless rather than wrong. Printing the number
 * and letting a human look at it is honest; failing on it would train everyone to
 * ignore this check.
 */

const root = fileURLToPath(new URL("../fixtures/external/", import.meta.url));

function stepFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...stepFiles(path));
    else if (/\.(step|stp)$/i.test(entry)) out.push(path);
  }
  return out;
}

const files = stepFiles(root);
if (!files.length) {
  console.log("occt.external.selfcheck skipped — no models fetched (`pnpm corpus:fetch`)");
  process.exit(0);
}

const failures: string[] = [];
const note = (why: string) => {
  failures.push(why);
  console.error(`  ✗ ${why}`);
};

/** OCCT's own answer for the whole placed document, for the advisory comparison. */
async function exactVolume(step: string): Promise<number | null> {
  const document = await readStep(step);
  const { oc, shapeTool } = document;
  try {
    let total = 0;
    for (const free of childLabels(oc, shapeTool.BaseLabel(), (l) => oc.XCAFDoc_ShapeTool.IsFree(l))) {
      const shape = oc.XCAFDoc_ShapeTool.GetShape_2(free);
      total += solidProps(oc, shape).volume;
      shape.delete();
    }
    return total;
  } catch {
    return null;
  } finally {
    document.close();
  }
}

console.log(`${files.length} real models from fixtures/external/\n`);
let closed = 0;
let open = 0;

for (const file of files) {
  const label = file.slice(root.length);
  const dest = mkdtempSync(join(tmpdir(), "sfab-external-"));
  const started = Date.now();
  try {
    await buildStepPackage(file, dest);
    const took = Date.now() - started;

    // Tier 0–1: hard. These hold for any file, including one nobody has ever opened.
    for (const why of checkPackage(dest)) note(`${label}: ${why}`);

    const pkg = JSON.parse(readFileSync(join(dest, "assembly.json"), "utf8")) as StepPackage;
    const meshes = readdirSync(join(dest, "components")).filter((f) => f.endsWith(".tess"));

    // Tier 2: advisory. A body that is not a closed, consistently wound surface
    // has no volume to compare, which is a fact about the file rather than a
    // defect in the loader — so this is printed and never thrown.
    const exact = await exactVolume(file);
    const drawn = meshProps(placedMesh(dest, pkg)).volume;
    let verdict: string;
    if (exact === null || Math.abs(exact) < 1e-6 || drawn <= 0) {
      verdict = "not a closed solid";
      open += 1;
    } else {
      const off = (Math.abs(drawn - exact) / Math.abs(exact)) * 100;
      verdict = `volume ${off < 2 ? "agrees" : `${off.toFixed(1)}% out`}`;
      closed += 1;
    }

    console.log(
      `  ${label.padEnd(42)} ${String(pkg.occurrences.length).padStart(4)} occ  ` +
        `${String(meshes.length).padStart(4)} comp  ${String(took).padStart(6)}ms  ${verdict}`,
    );
  } catch (err) {
    note(`${label}: ${briefError(err)}`);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

console.log(`\n${closed} closed solids, ${open} not closed.`);
// Reported rather than thrown. Every failure is already on stderr, and an
// uncaught throw here makes Node print the current source frame — which, with the
// wasm glue loaded through `new Function`, is 330KB of minified emscripten on one
// line, burying the results this check exists to show.
if (failures.length) {
  console.error(`\n${failures.length} failure(s) across ${files.length} real models`);
  process.exit(1);
}
console.log(`occt.external.selfcheck ok (${files.length} models)`);
