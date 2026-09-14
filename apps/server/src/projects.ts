import { existsSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { db } from "./db";
import type { CatalogEntry } from "@sfab-bench/contract";

const STEP_RE = /\.(step|stp)$/i;
const GLB_RE = /\.(glb|gltf)$/i;
const MAX_FILES = 2500;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  ".git",
  ".venv",
  ".cad-venv",
  ".cad-cache",
  "cad-cache",
  ".turbo",
  ".next",
  "coverage",
  "tmp",
]);

export type ProjectRow = {
  path: string;
  name: string;
  lastFile: string | null;
  openedAt: number;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    path TEXT PRIMARY KEY,
    last_file TEXT,
    opened_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS file_recents (
    project TEXT NOT NULL,
    path TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    PRIMARY KEY (project, path)
  );
`);

export const MAX_FILE_RECENTS = 12;

let active: string | null = null;
let revision = 0;
let watcher: FSWatcher | null = null;
let watchTimer: ReturnType<typeof setTimeout> | null = null;
const onProjectChange = new Set<() => void>();

export function subscribeProjectChange(fn: () => void) {
  onProjectChange.add(fn);
  return () => onProjectChange.delete(fn);
}

function bumpCatalog() {
  revision += 1;
}

function notifyOpened() {
  for (const fn of onProjectChange) fn();
}

export function catalogRevision(): number {
  return revision;
}

export function expandUserPath(input: string): string {
  const raw = input.trim();
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return raw;
}

export function posixRel(from: string, to: string) {
  return relative(from, to).split(sep).join("/");
}

export function insideRoot(root: string, abs: string) {
  const rel = relative(resolve(root), abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function skipDir(name: string) {
  return name.startsWith(".") || SKIP_DIRS.has(name);
}

export function shouldSkipDir(name: string) {
  return skipDir(name);
}

function walk(dir: string, root: string, acc: CatalogEntry[]) {
  if (acc.length >= MAX_FILES || !existsSync(dir)) return;
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of ents) {
    if (acc.length >= MAX_FILES) return;
    if (ent.isDirectory()) {
      if (skipDir(ent.name)) continue;
      walk(join(dir, ent.name), root, acc);
      continue;
    }
    if (!ent.isFile()) continue;
    if (STEP_RE.test(ent.name)) {
      acc.push({ path: posixRel(root, join(dir, ent.name)), kind: "step" });
    } else if (GLB_RE.test(ent.name) && !/\.raw\.(glb|gltf)$/i.test(ent.name)) {
      acc.push({ path: posixRel(root, join(dir, ent.name)), kind: "glb" });
    }
  }
}

export function listProjectFiles(root: string): CatalogEntry[] {
  const files: CatalogEntry[] = [];
  walk(resolve(root), resolve(root), files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function rowFrom(path: string, lastFile: string | null, openedAt: number): ProjectRow {
  return { path, name: basename(path), lastFile, openedAt };
}

export function listRecents(limit = 8): ProjectRow[] {
  const rows = db
    .prepare("SELECT path, last_file, opened_at FROM projects ORDER BY opened_at DESC LIMIT ?")
    .all(limit) as { path: string; last_file: string | null; opened_at: number }[];
  return rows.filter((row) => existsSync(row.path)).map((row) => rowFrom(row.path, row.last_file, row.opened_at));
}

export function projectPath(): string {
  if (!active) throw new Error("no project open");
  return active;
}

export function hasProject(): boolean {
  return active != null && existsSync(active);
}

export function currentProject(): ProjectRow | null {
  if (!active) return null;
  const row = db.prepare("SELECT path, last_file, opened_at FROM projects WHERE path = ?").get(active) as
    | { path: string; last_file: string | null; opened_at: number }
    | undefined;
  if (!row) return rowFrom(active, null, Date.now());
  return rowFrom(row.path, row.last_file, row.opened_at);
}

function stopWatch() {
  watcher?.close();
  watcher = null;
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = null;
}

function startWatch(root: string) {
  stopWatch();
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      const name = filename ? String(filename).split(sep)[0] ?? "" : "";
      if (name && skipDir(name)) return;
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(() => bumpCatalog(), 250);
    });
    watcher.on("error", () => {
      /* directory may have vanished */
    });
  } catch {
    /* recursive watch is best-effort */
  }
}

export function openProject(input: string): ProjectRow {
  const abs = resolve(expandUserPath(input));
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw Object.assign(new Error(`not a directory: ${input}`), { status: 400 });
  }
  const now = Date.now();
  const prev = db.prepare("SELECT last_file FROM projects WHERE path = ?").get(abs) as { last_file: string | null } | undefined;
  db.prepare(
    "INSERT INTO projects (path, last_file, opened_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET opened_at = excluded.opened_at",
  ).run(abs, prev?.last_file ?? null, now);
  const changed = active !== abs;
  active = abs;
  startWatch(abs);
  bumpCatalog();
  if (changed) notifyOpened();
  return rowFrom(abs, prev?.last_file ?? null, now);
}

export function setLastFile(rel: string | null) {
  if (!active) return;
  db.prepare("UPDATE projects SET last_file = ? WHERE path = ?").run(rel, active);
}

export function listFileRecents(limit = MAX_FILE_RECENTS): string[] {
  if (!active) return [];
  const root = active;
  const rows = db
    .prepare("SELECT path FROM file_recents WHERE project = ? ORDER BY opened_at DESC LIMIT ?")
    .all(root, limit) as { path: string }[];
  return rows.map((row) => row.path).filter((rel) => existsSync(join(root, rel)));
}

/** Record that someone opened a STEP/GLB. Does not change anyone's viewport. */
export function touchFileRecent(rel: string) {
  if (!active) return listFileRecents();
  const path = rel.trim().replace(/^\/+/, "");
  if (!path) return listFileRecents();
  const now = Date.now();
  db.prepare(
    "INSERT INTO file_recents (project, path, opened_at) VALUES (?, ?, ?) ON CONFLICT(project, path) DO UPDATE SET opened_at = excluded.opened_at",
  ).run(active, path, now);
  setLastFile(path);
  return listFileRecents();
}

export function listBrowse(input?: string) {
  const start = input?.trim() ? resolve(expandUserPath(input)) : homedir();
  if (!existsSync(start) || !statSync(start).isDirectory()) {
    throw Object.assign(new Error(`not a directory: ${input}`), { status: 400 });
  }
  const parent = dirname(start);
  const dirs: { name: string; path: string }[] = [];
  for (const ent of readdirSync(start, { withFileTypes: true })) {
    if (!ent.isDirectory() || skipDir(ent.name)) continue;
    dirs.push({ name: ent.name, path: join(start, ent.name) });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  return {
    path: start,
    parent: parent !== start ? parent : null,
    dirs,
  };
}

/** Open SFAB_BENCH_PROJECT, else the last recent that still exists, else nothing. */
export function bootProject() {
  const fromEnv = process.env.SFAB_BENCH_PROJECT?.trim();
  if (fromEnv) {
    openProject(fromEnv);
    return;
  }
  for (const row of listRecents(1)) {
    openProject(row.path);
    return;
  }
}
