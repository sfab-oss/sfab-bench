#!/usr/bin/env node
/** Tessellate a cadgen view package with mesh-export, copy .tess next to assembly.json. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHORD = 0.0015;
const ANGLE = 0.35;
const TESSELLATOR = 1;
const CADGEN_VERSION = "0.5.0";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function cacheKey(cid) {
  const num = (n) => Number(n).toExponential(6);
  return `${cid}-t${TESSELLATOR}-l${num(CHORD)}-a${num(ANGLE)}`;
}

function meshExportInVenv(root) {
  const site = path.join(root, "lib");
  if (!fs.existsSync(site)) return null;
  for (const py of fs.readdirSync(site)) {
    const cand = path.join(site, py, "site-packages/cadgen/_runtime/node/mesh-export.mjs");
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function meshExportPath() {
  const env = process.env.CADGEN_MESH_EXPORT?.trim();
  if (env && fs.existsSync(env)) return env;

  const roots = [];
  const managed = process.env.CADGEN_VENV?.trim()
    ? process.env.CADGEN_VENV.trim()
    : path.join(os.homedir(), ".sfab-bench/tools/cadgen", CADGEN_VERSION);
  roots.push(managed);
  roots.push(path.join(process.cwd(), "cad/.cad-venv"));

  for (const root of roots) {
    const found = meshExportInVenv(root);
    if (found) return found;
  }
  return path.join(managed, "lib/python3.12/site-packages/cadgen/_runtime/node/mesh-export.mjs");
}

function tessCacheDir() {
  const env = process.env.CADGEN_CACHE_DIR?.trim();
  if (env) return path.join(env, "meshes");
  return path.join(os.homedir(), ".cache/cadgen/meshes");
}

const pkg = process.argv[2];
if (!pkg || !path.isAbsolute(pkg)) fail("usage: tessellate_package.mjs /abs/package-dir");
const assemblyPath = path.join(pkg, "assembly.json");
if (!fs.existsSync(assemblyPath)) fail(`missing ${assemblyPath}`);

const exporter = meshExportPath();
if (!fs.existsSync(exporter)) fail(`missing mesh-export at ${exporter}`);

const tmpGlb = path.join(pkg, ".preview.glb");
const run = spawnSync(
  process.execPath,
  [
    exporter,
    "--package-dir",
    pkg,
    "--format",
    "glb",
    "--out",
    tmpGlb,
    "--chord-tolerance",
    String(CHORD),
    "--angle-tolerance",
    String(ANGLE),
  ],
  { encoding: "utf8" },
);
if (run.status !== 0) fail(run.stderr || run.stdout || `mesh-export exit ${run.status}`);
const report = JSON.parse((run.stdout || "").trim().split("\n").at(-1) || "{}");
if (!report.ok) fail(report.error || "mesh-export failed");

const assembly = JSON.parse(fs.readFileSync(assemblyPath, "utf8"));
const ids = Object.keys(assembly.components || {});
const cache = tessCacheDir();
let copied = 0;
for (const cid of ids) {
  const src = path.join(cache, `${cacheKey(cid)}.tess`);
  if (!fs.existsSync(src)) fail(`no tess cache for ${cid} at ${src}`);
  fs.copyFileSync(src, path.join(pkg, "components", `${cid}.tess`));
  copied += 1;
}
try {
  fs.unlinkSync(tmpGlb);
} catch {
  /* ignore */
}
console.log(`tessellated ${copied} components, ${report.files?.[0]?.triangleCount ?? "?"} triangles`);
