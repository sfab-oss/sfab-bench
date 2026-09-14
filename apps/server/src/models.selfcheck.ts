import { join } from "node:path";

import { opencodeBinCandidates } from "./models";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const otherHome = "/tmp/sfab-other-home";
const withProject = opencodeBinCandidates("/tmp/cad", otherHome);
expect(
  withProject.includes("/tmp/cad/.harness-bootstrap/opencode/node_modules/.bin/opencode"),
  "project bootstrap is first",
);
expect(
  withProject.includes(join(otherHome, ".opencode/bin/opencode")),
  "OpenCode under that user's home",
);
expect(withProject.includes("/opt/homebrew/bin/opencode"), "Homebrew opencode");
expect(withProject.includes("/usr/local/bin/opencode"), "Intel Homebrew / usr/local");

const withoutProject = opencodeBinCandidates(null, otherHome);
expect(
  !withoutProject.some((p) => p.includes(".harness-bootstrap")),
  "no project does not invent a bootstrap path",
);

console.log("models.selfcheck ok");
