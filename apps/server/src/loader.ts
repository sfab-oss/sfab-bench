import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { CADGEN_VERSION, cadgenDir } from "./config";
import { hasProject, projectPath } from "./projects";

let installing: Promise<string> | null = null;

function pythonAt(venv: string): string | null {
  const unix = join(venv, "bin", "python");
  return existsSync(unix) ? unix : null;
}

function managedReady(): string | null {
  const dir = cadgenDir();
  const py = pythonAt(dir);
  if (py && existsSync(join(dir, ".ok"))) return py;
  return null;
}

function projectFallback(): string | null {
  if (!hasProject()) return null;
  const py = join(projectPath(), "cad", ".cad-venv", "bin", "python");
  return existsSync(py) ? py : null;
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `${cmd} exited ${code}`));
    });
  });
}

function hasCmd(cmd: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn("which", [cmd], { stdio: "ignore" });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function createManaged(): Promise<string> {
  const dest = cadgenDir();
  mkdirSync(dest, { recursive: true });
  const useUv = await hasCmd("uv");
  const py312 = (await hasCmd("python3.12")) ? "python3.12" : (await hasCmd("python3")) ? "python3" : null;
  if (!useUv && !py312) {
    throw new Error("Python 3.12 is required to tessellate STEP. Install it, then reopen the file.");
  }
  console.log(`[loader] installing cadgen ${CADGEN_VERSION} into ${dest}`);
  if (useUv) {
    await run("uv", ["venv", "--python", "3.12", dest]);
    await run("uv", ["pip", "install", "--python", join(dest, "bin", "python"), `cadgen==${CADGEN_VERSION}`]);
  } else {
    await run(py312!, ["-m", "venv", dest]);
    const pip = join(dest, "bin", "pip");
    await run(pip, ["install", `cadgen==${CADGEN_VERSION}`]);
  }
  const py = pythonAt(dest);
  if (!py) throw new Error("managed cadgen venv is missing python");
  writeFileSync(join(dest, ".ok"), `${CADGEN_VERSION}\n`);
  console.log(`[loader] cadgen ready`);
  return py;
}

export function installCadgen(): Promise<string> {
  if (!installing) {
    installing = createManaged().finally(() => {
      installing = null;
    });
  }
  return installing;
}

/** Managed ~/.sfab-bench/tools/cadgen, with the project's cad/.cad-venv as a fast path. */
export async function cadgenPython(): Promise<string> {
  const ready = managedReady();
  if (ready) return ready;
  const fallback = projectFallback();
  if (fallback) {
    void installCadgen().catch((err) => console.error("[loader]", err));
    return fallback;
  }
  return installCadgen();
}
