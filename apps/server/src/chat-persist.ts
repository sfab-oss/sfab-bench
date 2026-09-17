import type { UIMessage } from "ai";

function errorPart(message: string) {
  return { type: "data-error" as const, data: { message } };
}

export function failedAssistant(errorText: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [errorPart(errorText)] as UIMessage["parts"],
  };
}

/** Attach a visible turn error so an empty or partial assistant is still persisted. */
export function withTurnError(
  assistant: UIMessage | undefined,
  errorText: string
): UIMessage {
  if (!assistant) return failedAssistant(errorText);
  const parts = assistant.parts ?? [];
  if (parts.some((part) => part.type === "data-error")) return assistant;
  return {
    ...assistant,
    parts: [...parts, errorPart(errorText)] as UIMessage["parts"],
  };
}

/** Abort and stream errors often yield an assistant with `parts: []`. Do not persist that placeholder. */
export function messagesToPersist(
  live: UIMessage[],
  assistant: UIMessage | undefined
): UIMessage[] {
  if (!assistant || (assistant.parts ?? []).length === 0) return live;
  return [...live, assistant];
}
