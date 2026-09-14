import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEV_API_HOST = "127.0.0.1";
export const APP_HOME = join(homedir(), ".sfab-bench");

/** Directories a Dock-launched `.app` does not inherit from the terminal. */
export function loginPathExtras(home = homedir()): string[] {
  return [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    join(home, ".local/bin"),
    join(home, ".opencode/bin"),
    join(home, "Library/pnpm"),
    join(home, ".local/share/pnpm"),
  ];
}

/**
 * Finder and Dock launches get `/usr/bin:/bin:/usr/sbin:/sbin`. Homebrew,
 * pnpm, and `opencode` live elsewhere. Prepend those dirs when they exist so
 * Codex bootstrap and the OpenCode picker still work from the `.app`.
 */
export function loginLikePath(current = process.env.PATH ?? "", home = homedir()): string {
  const extras = loginPathExtras(home).filter((dir) => existsSync(dir));
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const dir of [...extras, ...current.split(":")]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    parts.push(dir);
  }
  return parts.join(":");
}

export function ensureLoginLikePath(): void {
  process.env.PATH = loginLikePath();
}

export function cacheDir(): string {
  return join(APP_HOME, "cache");
}

export function envPort(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

export function apiPort(): number {
  return envPort("SFAB_BENCH_API_PORT", 8787);
}

/** HTTPS join port. 7322 = SFAB on a phone keypad. */
export const DEFAULT_PUBLIC_PORT = 7322;

export function publicPort(): number {
  return envPort("SFAB_BENCH_PUBLIC_PORT", DEFAULT_PUBLIC_PORT);
}

export function certDir(): string {
  return join(APP_HOME, "certs");
}
