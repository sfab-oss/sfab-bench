import { resolve } from "node:path";

import { expandUserPath } from "./projects";

export type CliAction =
  | { kind: "help"; error?: string }
  | { kind: "dev" | "serve"; project?: string };

export function parseCli(argv: string[]): CliAction {
  const args = [...argv];
  if (args.length === 0) return { kind: "serve" };
  const head = args[0];
  if (head === "-h" || head === "--help" || head === "help")
    return { kind: "help" };
  if (head === "open") {
    args.shift();
    const dir = args.shift();
    if (!dir)
      return { kind: "help", error: "usage: sfab-bench open <dir> [--dev]" };
    const project = resolve(expandUserPath(dir));
    const next = args[0];
    if (next === "--dev" || next === "dev") return { kind: "dev", project };
    if (next && next !== "serve")
      return { kind: "help", error: `unknown flag: ${next}` };
    return { kind: "serve", project };
  }
  if (head === "dev") return { kind: "dev" };
  if (head === "serve") return { kind: "serve" };
  return { kind: "help", error: `unknown command: ${head}` };
}
