import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, normalize } from "node:path";

import { harnessHome, pinProjectWorkdir, projectCwd } from "./local-sandbox";

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

console.log("local-sandbox.selfcheck ok");
