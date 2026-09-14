import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loginLikePath, loginPathExtras } from "./config";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const otherHome = "/tmp/sfab-other-home";
const extras = loginPathExtras(otherHome);
expect(extras.includes("/opt/homebrew/bin"), "Homebrew bin");
expect(extras.includes("/usr/local/bin"), "usr/local bin");
expect(extras.includes(join(otherHome, ".opencode/bin")), "~/.opencode/bin under that home");
expect(extras.includes(join(otherHome, "Library/pnpm")), "pnpm home under that home");

const current = "/usr/bin:/bin:/usr/sbin:/sbin";
const next = loginLikePath(current);
expect(next.includes("/usr/bin"), "keeps /usr/bin");
expect(next.includes("/bin"), "keeps /bin");
const parts = next.split(":");
expect(parts.filter((p) => p === "/usr/bin").length === 1, "dedupes /usr/bin");
if (parts.includes("/opt/homebrew/bin")) {
  expect(parts.indexOf("/opt/homebrew/bin") < parts.indexOf("/usr/bin"), "Homebrew precedes system PATH");
}

const again = loginLikePath(`${next}:/usr/bin`);
expect(again.split(":").filter((p) => p === "/usr/bin").length === 1, "dedupes when extras already on PATH");

const listen = readFileSync(new URL("./listen.ts", import.meta.url), "utf8");
expect(listen.includes("ensureLoginLikePath()"), "API boot patches PATH");

console.log("config.selfcheck ok");
