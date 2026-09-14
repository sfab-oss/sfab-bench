import { resolve } from "node:path";

import { parseCli } from "./cli-parse";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

expect(parseCli([]).kind === "serve", "default is serve");
expect(parseCli(["serve"]).kind === "serve", "serve");
expect(parseCli(["dev"]).kind === "dev", "dev");
expect(parseCli(["help"]).kind === "help", "help");

const opened = parseCli(["open", "/tmp/cad"]);
expect(opened.kind === "serve" && opened.project === resolve("/tmp/cad"), "open sets project then serve");

const openedDev = parseCli(["open", "/tmp/cad", "--dev"]);
expect(openedDev.kind === "dev" && openedDev.project === resolve("/tmp/cad"), "open --dev");

const missing = parseCli(["open"]);
expect(missing.kind === "help", "open without dir is help");

console.log("cli.selfcheck ok");
