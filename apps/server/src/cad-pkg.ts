import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

import { cacheDir } from "./config";
import { buildStepPackage } from "./occt/build";
import { insideRoot, posixRel } from "./projects";
import { rememberOpenedFile } from "./session";

const STEP_RE = /\.(step|stp)$/i;
const GLB_RE = /\.(glb|gltf)$/i;
const PKG_FILE = /^\/api\/cad-pkg\/(.+)\/(assembly\.json|components\/[^/]+\.tess)$/;
const PROJECT_FILE = /^\/api\/files\/(.+)$/;

const inflight = new Map<string, Promise<string>>();

/**
 * Bumped whenever a package's contents change shape. Occurrence ids and face
 * ordinals are refs the viewer and the assistant hand around, so a cache written
 * by an older build has to be rebuilt rather than served with refs that no longer
 * mean what they did.
 */
const PACKAGE_FORMAT = 2;

export type ResolvedArtifact =
  | { kind: "step"; rel: string; abs: string }
  | { kind: "glb"; rel: string; abs: string }
  | { error: string };

type SourceStamp = { path: string; mtimeMs: number; size: number; format: number };

/**
 * `abs` as the filesystem really knows it, or null if it is not a file inside
 * `rootReal`. Symlinks are resolved before the containment test, so a link inside
 * the project pointing out of it is caught — nothing else would catch that.
 */
function existingFile(rootReal: string, abs: string): string | null {
  if (!existsSync(abs)) return null;
  try {
    const real = realpathSync(abs);
    if (!insideRoot(rootReal, real)) return null;
    if (!statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

/** Map a show_artifact / ?file= value to a STEP or GLB inside `root`. */
export function resolveArtifact(input: string, root: string): ResolvedArtifact {
  let raw = input.trim().replace(/\\/g, "/");
  if (!raw) return { error: "empty path" };
  if (raw.startsWith("file://")) raw = fileURLToPath(raw);
  if (/^https?:\/\//i.test(raw)) return { error: "remote URLs are not documents" };

  /**
   * The project as the filesystem knows it, because `existingFile` resolves what it
   * finds the same way and the two are subtracted below. Skip this and they are
   * different bases: on macOS `/var` is a link to `/private/var`, so a project
   * opened under /tmp produced a `rel` full of `..` that climbed out of its own
   * project — and since that `rel` is the viewer's URL, the value handed to the
   * assistant and the recents entry, the file opened once and was refused ever after.
   */
  let base: string;
  try {
    base = realpathSync(root);
  } catch {
    return { error: "the project folder is gone" };
  }

  const qless = raw.split("?")[0] ?? raw;
  /**
   * An absolute path that lands inside the project is that file — an assistant
   * working in the folder will naturally produce one. Anything else is read as
   * project-relative, so a leading slash means the root of the project and not the
   * root of the filesystem, which is what `?file=/part.step` in a URL means.
   */
  const direct = isAbsolute(qless) ? existingFile(base, qless) : null;
  let rel = direct ? posixRel(base, direct) : qless.replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..")) return { error: "path escapes project" };

  const abs = direct ?? existingFile(base, resolve(base, rel));
  if (!abs) return { error: `no file at ${rel}` };
  rel = posixRel(base, abs);

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
  return { path: rel, mtimeMs: Math.round(st.mtimeMs), size: st.size, format: PACKAGE_FORMAT };
}

function isFresh(dest: string, stamp: SourceStamp): boolean {
  const ok = join(dest, "ok");
  const src = join(dest, "source.json");
  const assembly = join(dest, "assembly.json");
  if (!existsSync(ok) || !existsSync(src) || !existsSync(assembly)) return false;
  try {
    const prev = JSON.parse(readFileSync(src, "utf8")) as SourceStamp;
    return (
      prev.path === stamp.path &&
      prev.mtimeMs === stamp.mtimeMs &&
      prev.size === stamp.size &&
      prev.format === stamp.format
    );
  } catch {
    return false;
  }
}

async function buildPackage(rel: string, abs: string): Promise<string> {
  const dest = packageCacheDir(abs);
  const stamp = stampOf(rel, abs);
  if (isFresh(dest, stamp)) return dest;
  console.log(`[cad-pkg] tessellate ${rel}`);
  mkdirSync(join(dest, ".."), { recursive: true });
  try {
    await buildStepPackage(abs, dest);
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
export async function handleCadPkg(req: Request, root: string): Promise<Response> {
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
  const resolved = resolveArtifact(rel, root);
  if ("error" in resolved) return jsonResponse(404, { error: resolved.error });
  if (resolved.kind !== "step") return jsonResponse(400, { error: "cad-pkg only serves STEP" });

  if (file === "assembly.json") rememberOpenedFile(resolved.rel, root);

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

/** Serve a GLB/GLTF from the named project (paired clients cannot hit disk otherwise). */
export async function handleProjectFile(req: Request, root: string): Promise<Response> {
  const path = new URL(req.url).pathname;
  const m = PROJECT_FILE.exec(path);
  if (!m) return jsonResponse(404, { error: "file not found" });
  let rel = m[1] ?? "";
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return jsonResponse(400, { error: "bad path" });
  }
  const resolved = resolveArtifact(rel, root);
  if ("error" in resolved) return jsonResponse(404, { error: resolved.error });
  if (resolved.kind !== "glb") return jsonResponse(400, { error: "not a GLB" });
  rememberOpenedFile(resolved.rel, root);
  return fileResponse(resolved.abs, mimeFor(resolved.abs), req.method === "HEAD");
}
