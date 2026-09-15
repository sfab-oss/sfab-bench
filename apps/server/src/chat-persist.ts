import type { UIMessage } from "ai";

/** Abort and stream errors often yield an assistant with `parts: []`. Do not persist that placeholder. */
export function messagesToPersist(live: UIMessage[], assistant: UIMessage | undefined): UIMessage[] {
  if (!assistant || (assistant.parts ?? []).length === 0) return live;
  return [...live, assistant];
}
