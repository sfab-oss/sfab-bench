import { homedir } from "node:os";
import { join } from "node:path";

export const DEV_API_HOST = "127.0.0.1";
export const APP_HOME = join(homedir(), ".sfab-bench");
export const CADGEN_VERSION = "0.5.0";

export function cacheDir(): string {
  return join(APP_HOME, "cache");
}

export function cadgenDir(): string {
  return join(APP_HOME, "tools", "cadgen", CADGEN_VERSION);
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

export function publicPort(): number {
  return envPort("SFAB_BENCH_PUBLIC_PORT", 5173);
}

export function certDir(): string {
  return join(APP_HOME, "certs");
}
