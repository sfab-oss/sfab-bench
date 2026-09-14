/**
 * Files Codex and OpenCode read from dist/bridge via import.meta.url.
 * electron-builder strips lockfiles from node_modules; package.mjs copies
 * them back. This list is the shipping invariant, not a full directory walk.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const HARNESS_BRIDGE_ASSETS = [
  "node_modules/@ai-sdk/harness-codex/dist/bridge/pnpm-lock.yaml",
  "node_modules/@ai-sdk/harness-opencode/dist/bridge/pnpm-lock.yaml",
  "node_modules/@ai-sdk/harness-opencode/dist/bridge/pnpm-workspace.yaml",
];

export function assertHarnessBridgeAssets(root, label) {
  const missing = HARNESS_BRIDGE_ASSETS.filter((rel) => !existsSync(join(root, rel)));
  if (missing.length) {
    throw new Error(`${label} missing harness bridge files:\n${missing.join("\n")}`);
  }
}
