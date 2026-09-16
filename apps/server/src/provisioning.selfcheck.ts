import { installFailureDetail } from "./provisioning";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

expect(
  installFailureDetail("codex", new Error("getaddrinfo ENOTFOUND registry.npmjs.org")) ===
    "Could not install Codex — no connection to the registry.",
  "offline install says so",
);
expect(
  installFailureDetail("cursor", new Error("Bootstrap command failed for harness 'cursor' (exit 1)")) ===
    "Could not install Cursor.",
  "other failures stay short",
);
expect(!installFailureDetail("codex", new Error("pnpm exploded")).includes("pnpm"), "no tool noise in the copy");
expect(installFailureDetail("grok-build", "not an Error").startsWith("Could not install Grok"), "a thrown non-Error still reads");

console.log("provisioning.selfcheck ok");
