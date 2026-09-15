/** Abort often finishes with an assistant `parts: []`. Skip that PUT so we don't wipe a real turn. */
export function shouldPersistMessages(messages: { role?: string; parts?: unknown[] }[]) {
  const last = messages.at(-1);
  return !(last?.role === "assistant" && (last.parts?.length ?? 0) === 0);
}
