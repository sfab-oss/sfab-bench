import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, normalize } from "node:path";

import { harnessHome, pinProjectWorkdir, projectCwd, sandboxEnv } from "./local-sandbox";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const root = mkdtempSync(join(tmpdir(), "sfab-sandbox-cwd-"));
const appHome = mkdtempSync(join(tmpdir(), "sfab-app-home-"));
const stateDir = harnessHome(root, appHome);
expect(stateDir.startsWith(join(appHome, "harness") + "/"), "state lives under APP_HOME/harness");
expect(!stateDir.startsWith(root + "/") && stateDir !== root, "state is not the CAD folder");

const nested = join(root, "opencode-abc:high");
const cacheSession = join(stateDir, "opencode-abc");

expect(projectCwd(root) === root, "omitted working directory is the project");
expect(projectCwd(root, nested) === root, "legacy session subdir in the project pins to the project");
expect(projectCwd(root, "src") === root, "relative child pins to the project");
expect(
  projectCwd(root, cacheSession, stateDir) === normalize(cacheSession),
  "bootstrap cwd under the cache is left alone",
);

const homeOpenCode = join(homedir(), ".opencode", "cache");
expect(projectCwd(root, homeOpenCode) === normalize(homeOpenCode), "allowed host paths stay");

const cmd = `node bridge.mjs --workdir '${cacheSession}' --bridge-state-dir '${stateDir}/.agent-runs/abc/bridge' --skills-dir '${join(homedir(), ".agents", "skills")}'`;
const pinned = pinProjectWorkdir(cmd, root, stateDir);
expect(pinned.includes(`--workdir '${root}'`), `bridge --workdir is the project, got ${pinned}`);
expect(pinned.includes(".agent-runs/abc/bridge"), "bridge-state-dir is unchanged");
expect(
  pinProjectWorkdir(`node x --workdir '${root}'`, root, stateDir).includes(`--workdir '${root}'`),
  "already-project --workdir is left alone",
);
expect(
  pinProjectWorkdir(`node x --workdir '${tmpdir()}/scratch'`, root, stateDir).includes(`${tmpdir()}/scratch`),
  "workdir outside project and cache is left alone",
);

const launcher = {
  PATH: "/usr/bin",
  HOME: "/Users/someone",
  PNPM_HOME: "/Users/someone/Library/pnpm",
  WATCH_REPORT_DEPENDENCIES: "1",
  NODE_OPTIONS: "--import tsx",
  NODE_PATH: "/repo/node_modules/tsx/node_modules",
  npm_command: "exec",
  npm_config_user_agent: "pnpm/11.21.0",
  pnpm_config_verify_deps_before_run: "false",
  PNPM_PACKAGE_NAME: "@sfab-bench/server",
};
const clean = sandboxEnv(launcher);
expect(clean.PATH === "/usr/bin" && clean.HOME === "/Users/someone", "the real environment survives");
expect(clean.PNPM_HOME === launcher.PNPM_HOME, "a user's pnpm install is not a launcher marker");
expect(!("WATCH_REPORT_DEPENDENCIES" in clean), "tsx --watch does not leak into pnpm's workers");
expect(!("NODE_OPTIONS" in clean) && !("NODE_PATH" in clean), "our loader does not follow the child");
expect(
  !Object.keys(clean).some((k) => k.startsWith("npm_") || k.startsWith("pnpm_config_")),
  "pnpm exec lifecycle config is dropped",
);
expect(!("PNPM_PACKAGE_NAME" in clean), "the child is not part of our package");
expect(sandboxEnv(launcher, { NODE_OPTIONS: "--enable-source-maps" }).NODE_OPTIONS === "--enable-source-maps", "an explicit override still wins");

console.log("local-sandbox.selfcheck ok");
