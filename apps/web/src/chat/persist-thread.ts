/** Abort often finishes with an assistant `parts: []`. Skip that PUT so we don't wipe a real turn. */
export function shouldPersistMessages(messages: { role?: string; parts?: unknown[] }[]) {
  const last = messages.at(-1);
  return !(last?.role === "assistant" && (last.parts?.length ?? 0) === 0);
}

function errorPart(message: string) {
  return { type: "data-error" as const, data: { message } };
}

export function isTurnErrorPart(part: { type?: string }): boolean {
  return part.type === "data-error";
}

export function turnErrorText(part: { type?: string; data?: unknown }): string | null {
  if (part.type !== "data-error" || !part.data || typeof part.data !== "object" || !("message" in part.data)) {
    return null;
  }
  const message = part.data.message;
  return typeof message === "string" && message ? message : null;
}

/** Stream errors finish with a user-only or empty assistant. Keep the error in the thread. */
export function messagesWithTurnError<T extends { id?: string; role?: string; parts?: unknown[] }>(
  messages: T[],
  errorText: string,
): T[] {
  const last = messages.at(-1);
  const part = errorPart(errorText);
  if (last?.role === "assistant") {
    const parts = (last.parts ?? []) as { type?: string }[];
    if (parts.some(isTurnErrorPart)) return messages;
    return [...messages.slice(0, -1), { ...last, parts: [...parts, part] }];
  }
  return [
    ...messages,
    { id: crypto.randomUUID(), role: "assistant", parts: [part] } as T,
  ];
}

/** On error, do not PUT a user-only history — that wipes a server-persisted failure. */
export function finishPersistMessages<T extends { role?: string; parts?: unknown[] }>(
  messages: T[],
  isError: boolean,
  errorText: string | null,
): T[] | null {
  const next = isError && errorText ? messagesWithTurnError(messages, errorText) : messages;
  if (isError && !errorText) {
    const last = next.at(-1);
    if (last?.role !== "assistant" || (last.parts?.length ?? 0) === 0) return null;
  }
  if (!shouldPersistMessages(next)) return null;
  return next;
}
