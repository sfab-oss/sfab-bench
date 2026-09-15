import { db } from "./db";

const KEY = "stt_ai_gateway_api_key";

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function readStored(): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(KEY) as { value: string } | undefined;
  const value = row?.value?.trim() ?? "";
  return value || null;
}

export function setStoredSttApiKey(value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    db.prepare("DELETE FROM kv WHERE key = ?").run(KEY);
    return;
  }
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    KEY,
    trimmed,
  );
}

export type SttKeySource = "settings" | "env" | null;

/** Pure so selfchecks can pin env without touching sqlite. */
export function resolveSttApiKey(
  stored: string | null,
  env: NodeJS.ProcessEnv = process.env,
): { key: string; source: Exclude<SttKeySource, null> } | { key: null; source: null } {
  const fromStore = stored?.trim() ?? "";
  if (fromStore) return { key: fromStore, source: "settings" };
  const named = env.STT_AI_GATEWAY_API_KEY?.trim();
  if (named) return { key: named, source: "env" };
  const legacy = env.AI_GATEWAY_API_KEY?.trim();
  if (legacy) return { key: legacy, source: "env" };
  return { key: null, source: null };
}

export function sttApiKey() {
  return resolveSttApiKey(readStored());
}
