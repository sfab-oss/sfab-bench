import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveArtifact } from "./cad-pkg";
import { listProjectFiles, shouldSkipDir } from "./projects";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

expect(shouldSkipDir("node_modules"), "node_modules skipped");
expect(shouldSkipDir(".git"), "dot dirs skipped");
expect(shouldSkipDir(".cad-venv"), "cad venv skipped");
expect(!shouldSkipDir("STEP"), "STEP is walked");
expect(!shouldSkipDir("references"), "references is walked");

const root = mkdtempSync(join(tmpdir(), "xr-project-"));
mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
writeFileSync(join(root, "node_modules", "pkg", "hidden.step"), "ISO-10303");
mkdirSync(join(root, "cad", "STEP", "envelopes"), { recursive: true });
writeFileSync(join(root, "cad", "STEP", "envelopes", "box.step"), "ISO-10303");
mkdirSync(join(root, "cad", "src"), { recursive: true });
writeFileSync(join(root, "cad", "src", "box.py"), "print(1)\n");
writeFileSync(join(root, "part.glb"), "glTF");

const files = listProjectFiles(root);
expect(files.some((f) => f.path === "cad/STEP/envelopes/box.step"), "project STEP is listed");
expect(files.some((f) => f.path === "part.glb" && f.kind === "glb"), "project GLB is listed");
expect(!files.some((f) => f.path.includes("node_modules")), "node_modules STEP is ignored");
expect(!files.some((f) => f.path.endsWith(".py")), "python scripts are not documents");

const step = resolveArtifact("cad/STEP/envelopes/box.step", root);
expect(!("error" in step) && step.kind === "step", "resolve STEP inside project");
const py = resolveArtifact("cad/src/box.py", root);
expect("error" in py, "scripts are not artifacts");
const escape = resolveArtifact("../outside.step", root);
expect("error" in escape, "parent paths are rejected");
const missing = resolveArtifact("cad/STEP/nope.step", root);
expect("error" in missing, "missing STEP is rejected");

console.log("project.selfcheck ok");
