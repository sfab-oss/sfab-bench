import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

import { cacheDir } from "./config";
import { cadgenPython } from "./loader";
import { insideRoot, posixRel, projectPath } from "./projects";
import { rememberOpenedFile } from "./session";

const STEP_RE = /\.(step|stp)$/i;
const GLB_RE = /\.(glb|gltf)$/i;
const PKG_FILE = /^\/api\/cad-pkg\/(.+)\/(assembly\.json|components\/[^/]+\.tess)$/;
const PROJECT_FILE = /^\/api\/files\/(.+)$/;

const inflight = new Map<string, Promise<string>>();
const dumpScript = fileURLToPath(new URL("../scripts/dump_step_package.py", import.meta.url));

export type ResolvedArtifact =
  | { kind: "step"; rel: string; abs: string }
  | { kind: "glb"; rel: string; abs: string }
  | { error: string };

type SourceStamp = { path: string; mtimeMs: number; size: number };

function existingFile(root: string, abs: string): string | null {
  if (!existsSync(abs)) return null;
  try {
    const real = realpathSync(abs);
    const rootReal = realpathSync(root);
    if (!insideRoot(rootReal, real)) return null;
    if (!statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

/** Map a show_artifact / ?file= value to a STEP or GLB inside the open project. */
export function resolveArtifact(input: string, root = projectPath()): ResolvedArtifact {
  let raw = input.trim().replace(/\\/g, "/");
  if (!raw) return { error: "empty path" };
  if (raw.startsWith("file://")) raw = fileURLToPath(raw);
  if (/^https?:\/\//i.test(raw)) return { error: "remote URLs are not documents" };

  const qless = raw.split("?")[0] ?? raw;
  let rel = qless.replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..")) return { error: "path escapes project" };

  const abs = existingFile(root, resolve(root, rel));
  if (!abs) return { error: `no file at ${rel}` };
  rel = posixRel(root, abs);

  if (STEP_RE.test(rel)) return { kind: "step", rel, abs };
  if (GLB_RE.test(rel)) return { kind: "glb", rel, abs };
  return { error: `not a STEP or GLB: ${input}` };
}

export function shownUrl(resolved: Exclude<ResolvedArtifact, { error: string }>): string {
  return resolved.rel;
}

function packageCacheDir(abs: string) {
  const id = createHash("sha256").update(abs).digest("hex").slice(0, 16);
  return join(cacheDir(), id);
}

function stampOf(rel: string, abs: string): SourceStamp {
  const st = statSync(abs);
  return { path: rel, mtimeMs: Math.round(st.mtimeMs), size: st.size };
}

function isFresh(dest: string, stamp: SourceStamp): boolean {
  const ok = join(dest, "ok");
  const src = join(dest, "source.json");
  const assembly = join(dest, "assembly.json");
  if (!existsSync(ok) || !existsSync(src) || !existsSync(assembly)) return false;
  try {
    const prev = JSON.parse(readFileSync(src, "utf8")) as SourceStamp;
    return prev.path === stamp.path && prev.mtimeMs === stamp.mtimeMs && prev.size === stamp.size;
  } catch {
    return false;
  }
}

function runDump(py: string, abs: string, dest: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(py, [dumpScript, abs, "--dest", dest], {
      cwd: projectPath(),
      env: process.env,
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("tessellate timed out"));
    }, 5 * 60 * 1000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(stderr.trim() || `dump_step_package exited ${code}`));
    });
  });
}

async function buildPackage(rel: string, abs: string): Promise<string> {
  const dest = packageCacheDir(abs);
  const stamp = stampOf(rel, abs);
  if (isFresh(dest, stamp)) return dest;
  console.log(`[cad-pkg] tessellate ${rel}`);
  mkdirSync(join(dest, ".."), { recursive: true });
  try {
    const py = await cadgenPython();
    await mkdir(dest, { recursive: true });
    await runDump(py, abs, dest);
    writeFileSync(join(dest, "source.json"), JSON.stringify(stamp));
    writeFileSync(join(dest, "ok"), "ok\n");
  } catch (err) {
    await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
  console.log(`[cad-pkg] wrote ${dest}`);
  return dest;
}

export function ensurePackage(rel: string, abs: string): Promise<string> {
  const key = abs;
  let pending = inflight.get(key);
  if (!pending) {
    pending = buildPackage(rel, abs).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function fileResponse(file: string, type: string, head: boolean): Response {
  const headers = { "content-type": type, "cache-control": "no-store" };
  if (head) return new Response(null, { status: 200, headers });
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
}

function mimeFor(file: string) {
  if (file.endsWith(".json")) return "application/json";
  if (/\.glb$/i.test(file)) return "model/gltf-binary";
  if (/\.gltf$/i.test(file)) return "model/gltf+json";
  return "application/octet-stream";
}

/** Serve /api/cad-pkg/<project-rel-step>/{assembly.json,components/*.tess}. */
export async function handleCadPkg(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  const m = PKG_FILE.exec(path);
  if (!m) return jsonResponse(404, { error: "cad package file not found" });

  let rel = m[1] ?? "";
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return jsonResponse(400, { error: "bad package path" });
  }
  const file = m[2] ?? "";
  const resolved = resolveArtifact(rel);
  if ("error" in resolved) return jsonResponse(404, { error: resolved.error });
  if (resolved.kind !== "step") return jsonResponse(400, { error: "cad-pkg only serves STEP" });

  if (file === "assembly.json") rememberOpenedFile(resolved.rel);

  let dest: string;
  try {
    dest = await ensurePackage(resolved.rel, resolved.abs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cad-pkg]", message);
    return jsonResponse(500, { error: message });
  }

  const absFile = resolve(dest, file);
  const fromDest = relative(dest, absFile);
  if (fromDest.startsWith("..") || isAbsolute(fromDest) || !existsSync(absFile)) {
    return jsonResponse(404, { error: `${file} missing from package` });
  }
  return fileResponse(absFile, mimeFor(file), req.method === "HEAD");
}

/** Serve a GLB/GLTF from the open project (paired clients cannot hit disk otherwise). */
export async function handleProjectFile(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  const m = PROJECT_FILE.exec(path);
  if (!m) return jsonResponse(404, { error: "file not found" });
  let rel = m[1] ?? "";
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return jsonResponse(400, { error: "bad path" });
  }
  const resolved = resolveArtifact(rel);
  if ("error" in resolved) return jsonResponse(404, { error: resolved.error });
  if (resolved.kind !== "glb") return jsonResponse(400, { error: "not a GLB" });
  rememberOpenedFile(resolved.rel);
  return fileResponse(resolved.abs, mimeFor(resolved.abs), req.method === "HEAD");
}
