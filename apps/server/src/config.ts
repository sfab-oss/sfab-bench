import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEV_API_HOST = "127.0.0.1";
export const APP_HOME = join(homedir(), ".sfab-bench");

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Copy `.env.example` here. Shell env wins over this file. */
export function homeEnvPath(home = homedir()): string {
  return join(home, ".sfab-bench", ".env");
}

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!ENV_KEY.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    out[key] = value;
  }
  return out;
}

/** Fill empty keys only. A set shell var is left alone. */
export function applyEnvFile(
  parsed: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): void {
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key]?.trim()) continue;
    env[key] = value;
  }
}

export function loadHomeEnv(home = homedir()): void {
  const file = homeEnvPath(home);
  if (!existsSync(file)) return;
  try {
    applyEnvFile(parseEnvFile(readFileSync(file, "utf8")));
  } catch {
    // Missing or unreadable is the same as no file.
  }
}

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
export function loginLikePath(
  current = process.env.PATH ?? "",
  home = homedir()
): string {
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
