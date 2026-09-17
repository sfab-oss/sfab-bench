#!/usr/bin/env node
/**
 * Clone CLI. Same commands as `pnpm cli`. Serve is `listen.ts`, which the
 * `.app` also runs as `api.mjs` — not a second server. `app` (open cwd in the
 * desktop window) is ship-02.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "cli.ts");
const require = createRequire(import.meta.url);
let tsx;
try {
  tsx = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
} catch {
  console.error(
    "sfab-bench: tsx is missing. From the clone, run pnpm install."
  );
  process.exit(1);
}

const child = spawn(process.execPath, [tsx, cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
