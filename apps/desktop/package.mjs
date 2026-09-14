#!/usr/bin/env node
/**
 * Stages a self-contained app directory, then packages it with electron-builder.
 *
 * The staging step exists because pnpm's node_modules is a tree of symlinks into
 * a content-addressed store, and electron-builder wants a plain directory it can
 * copy. `app/` gets its own package.json with only the dependencies the bundled
 * server still loads at runtime, installed flat with npm.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const stage = join(here, "app");
// Staged beside the real thing and moved into place at the end, so a run that
// fails half way through leaves the last good app/ — and its node_modules —
// exactly where it was.
const next = join(here, "app.next");
const previous = join(here, "app.prev");

const serverPkg = JSON.parse(readFileSync(join(here, "..", "server", "package.json"), "utf8"));
const desktopPkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

const runtimeDeps = Object.fromEntries(
  Object.entries(serverPkg.dependencies).filter(([name]) => !name.startsWith("@sfab-bench/")),
);

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } });

console.log("[package] building bundles");
run("node", [join(here, "build.mjs")], here);

if (!existsSync(join(root, "apps", "web", "dist", "index.html"))) {
  throw new Error("apps/web/dist is missing — run `pnpm --filter @sfab-bench/web build` first");
}

console.log("[package] staging app/");
rmSync(next, { recursive: true, force: true });
mkdirSync(next, { recursive: true });
// Carried over so npm has something to work from; it prunes and adds as needed.
if (existsSync(join(stage, "node_modules"))) {
  cpSync(join(stage, "node_modules"), join(next, "node_modules"), { recursive: true });
}
writeFileSync(
  join(next, "package.json"),
  `${JSON.stringify(
    {
      name: "sfab-bench",
      productName: "sfab-bench",
      version: desktopPkg.version,
      private: true,
      main: "main.cjs",
      dependencies: runtimeDeps,
    },
    null,
    2,
  )}\n`,
);
for (const file of ["main.cjs", "preload.cjs"]) {
  cpSync(join(here, "dist", file), join(next, file));
}
cpSync(join(here, "..", "server", "dist", "api.mjs"), join(next, "api.mjs"));
cpSync(join(root, "apps", "web", "dist"), join(next, "web"), { recursive: true });

console.log("[package] installing runtime dependencies (npm, flat)");
run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], next);

rmSync(previous, { recursive: true, force: true });
if (existsSync(stage)) renameSync(stage, previous);
renameSync(next, stage);
rmSync(previous, { recursive: true, force: true });

console.log("[package] electron-builder");
run(join(here, "node_modules", ".bin", "electron-builder"), ["--config", join(here, "electron-builder.yml")], here);

/**
 * electron-builder is told `identity: null`, which leaves the .app carrying
 * Electron's own signature over contents we then replaced. On Apple silicon an
 * invalid signature is worse than none: the kernel refuses to launch the binary
 * at all, with nothing in the UI to say why. An ad-hoc signature (`-`) is not a
 * developer identity and does not notarise, but it is valid, and the app starts
 * after the usual right-click → Open.
 */
const release = join(here, "release");
const apps = readdirSync(release, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(release, entry.name, "sfab-bench.app"))
  .filter((path) => existsSync(path));
if (process.platform === "darwin") {
  if (!apps.length) throw new Error(`no sfab-bench.app under ${release}`);
  for (const app of apps) {
    console.log(`[package] ad-hoc signing ${app}`);
    run("codesign", ["--force", "--deep", "--sign", "-", app], here);
    run("codesign", ["--verify", "--deep", "--strict", app], here);
  }
}
console.log(`[package] done: ${apps.join(", ")}`);
