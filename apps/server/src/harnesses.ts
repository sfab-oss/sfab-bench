import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_HARNESS_MODEL,
  HARNESS_IDS,
  HARNESS_LABEL,
  STATIC_HARNESS_MODELS,
  type HarnessId,
} from "@sfab-bench/contract";
import { listOpenCodeModels } from "./models";

export type HarnessStatus = "ready" | "missing-cli" | "needs-auth" | "error";

export type HarnessModel = {
  id: string;
  name: string;
  slug: string;
  group?: string;
};

export type HarnessInfo = {
  id: HarnessId;
  label: string;
  status: HarnessStatus;
  detail?: string;
  defaultModel: string;
  models: HarnessModel[];
};

function envSet(name: string) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function cursorLoggedIn() {
  if (envSet("CURSOR_API_KEY")) return true;
  const cfg = readJson(join(homedir(), ".cursor", "cli-config.json"));
  if (!cfg || typeof cfg !== "object") return false;
  const auth = (cfg as { authInfo?: { email?: unknown; userId?: unknown } }).authInfo;
  return Boolean(auth && (auth.email || auth.userId));
}

function grokLoggedIn() {
  if (envSet("XAI_API_KEY")) return true;
  const auth = readJson(join(homedir(), ".grok", "auth.json"));
  if (!auth || typeof auth !== "object") return false;
  return Object.values(auth as Record<string, unknown>).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const rec = entry as { key?: unknown; refresh_token?: unknown; auth_mode?: unknown };
    return Boolean(rec.key || rec.refresh_token || rec.auth_mode);
  });
}

function staticModels(id: Exclude<HarnessId, "opencode">): HarnessModel[] {
  return STATIC_HARNESS_MODELS[id].map((m) => ({ ...m, slug: m.id }));
}

async function probeOpenCode(): Promise<HarnessInfo> {
  const catalog = await listOpenCodeModels();
  const models: HarnessModel[] = catalog.providers.flatMap((p) =>
    p.models.map((m) => ({ id: m.slug, name: m.name, slug: m.slug, group: p.name })),
  );
  if (!catalog.connected) {
    return {
      id: "opencode",
      label: HARNESS_LABEL.opencode,
      status: "missing-cli",
      detail: "OpenCode bootstrap missing or models unavailable.",
      defaultModel: DEFAULT_HARNESS_MODEL.opencode,
      models,
    };
  }
  return {
    id: "opencode",
    label: HARNESS_LABEL.opencode,
    status: "ready",
    defaultModel: DEFAULT_HARNESS_MODEL.opencode,
    models,
  };
}

function probeCodex(): HarnessInfo {
  const authed =
    envSet("OPENAI_API_KEY") ||
    envSet("CODEX_API_KEY") ||
    existsSync(join(homedir(), ".codex"));
  return {
    id: "codex",
    label: HARNESS_LABEL.codex,
    status: authed ? "ready" : "needs-auth",
    detail: authed ? undefined : "Needs OPENAI_API_KEY, CODEX_API_KEY, or a Codex login.",
    defaultModel: DEFAULT_HARNESS_MODEL.codex,
    models: staticModels("codex"),
  };
}

function probeCursor(): HarnessInfo {
  const authed = cursorLoggedIn();
  return {
    id: "cursor",
    label: HARNESS_LABEL.cursor,
    status: authed ? "ready" : "needs-auth",
    detail: authed ? undefined : "Sign in with Cursor CLI, or set CURSOR_API_KEY.",
    defaultModel: DEFAULT_HARNESS_MODEL.cursor,
    models: staticModels("cursor"),
  };
}

function probeGrok(): HarnessInfo {
  const authed = grokLoggedIn();
  return {
    id: "grok-build",
    label: HARNESS_LABEL["grok-build"],
    status: authed ? "ready" : "needs-auth",
    detail: authed ? undefined : "Sign in with the Grok CLI, or set XAI_API_KEY.",
    defaultModel: DEFAULT_HARNESS_MODEL["grok-build"],
    models: staticModels("grok-build"),
  };
}

export async function listHarnesses(): Promise<{ harnesses: HarnessInfo[] }> {
  const opencode = await probeOpenCode();
  return {
    harnesses: HARNESS_IDS.map((id) => {
      if (id === "opencode") return opencode;
      if (id === "codex") return probeCodex();
      if (id === "cursor") return probeCursor();
      return probeGrok();
    }),
  };
}
