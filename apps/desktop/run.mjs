#!/usr/bin/env node
/**
 * Launch Electron with ELECTRON_RUN_AS_NODE stripped.
 *
 * This environment sometimes sets that variable so Electron can host a Node
 * tool. If it is still set when we spawn the app, Electron never becomes
 * Electron: `app` is undefined and the first call crashes with
 * `requestSingleInstanceLock` of undefined. Packaging already strips it;
 * `pnpm desktop` has to as well.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const electron = createRequire(import.meta.url)("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, process.argv.slice(2), {
  cwd: dirname(fileURLToPath(import.meta.url)),
  env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
