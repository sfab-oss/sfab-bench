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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const stage = join(here, "app");

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
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
writeFileSync(
  join(stage, "package.json"),
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
  cpSync(join(here, "dist", file), join(stage, file));
}
cpSync(join(here, "..", "server", "dist", "api.mjs"), join(stage, "api.mjs"));
cpSync(join(root, "apps", "web", "dist"), join(stage, "web"), { recursive: true });

console.log("[package] installing runtime dependencies (npm, flat)");
run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], stage);

console.log("[package] electron-builder");
run(join(here, "node_modules", ".bin", "electron-builder"), ["--config", join(here, "electron-builder.yml")], here);
