#!/usr/bin/env node
/**
 * Catches the two packaged-app harness failures without running electron-builder:
 * missing dist/bridge lockfiles, and a Dock-launched app that cannot see
 * Homebrew / opencode. If a .app from `pnpm desktop:package` is present, it
 * is checked too.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertHarnessBridgeAssets } from "./harness-bridge.mjs";

function expect(cond, label) {
  if (!cond) throw new Error(label);
}

const empty = mkdtempSync(join(tmpdir(), "sfab-bridge-"));
try {
  let threw = false;
  try {
    assertHarnessBridgeAssets(empty, "empty dir");
  } catch (err) {
    threw = String(err).includes("missing harness bridge");
  }
  expect(threw, "assertHarnessBridgeAssets fails closed");
} finally {
  rmSync(empty, { recursive: true, force: true });
}

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "..", "server");

assertHarnessBridgeAssets(server, "server node_modules");

const packager = readFileSync(join(here, "package.mjs"), "utf8");
expect(
  packager.includes("restoreHarnessBridgeAssets"),
  "package.mjs still restores harness bridge files"
);
expect(
  packager.includes("assertHarnessBridgeAssets"),
  "package.mjs still asserts those files after restore"
);
expect(
  packager.includes('["api.mjs", "occt-worker.mjs"]'),
  "the .app still copies only the API and the tessellation worker"
);
expect(!packager.includes("emu-worker"), "esp-emu worker is not packaged");
expect(!packager.includes("vendor/esp-emu"), "esp-emu wasm is not packaged");

const main = readFileSync(join(here, "src", "main.ts"), "utf8");
expect(
  main.includes("loginLikePath()"),
  "desktop fork env still gets a login-like PATH"
);
expect(main.includes("loadHomeEnv()"), "desktop loads ~/.sfab-bench/.env");

const app = join(here, "release", "mac-arm64", "sfab-bench.app");
if (existsSync(app)) {
  assertHarnessBridgeAssets(
    join(app, "Contents", "Resources", "app"),
    "packaged app"
  );
  console.log("package.selfcheck ok (including packaged app)");
} else {
  console.log("package.selfcheck ok (no packaged app; skipped .app check)");
}
