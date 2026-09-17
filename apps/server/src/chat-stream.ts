/** Terminal model step — not a tool pause and not a failed step. */
export function isCompletedTurnFinish(reason: unknown): boolean {
  if (reason === "stop" || reason === "length" || reason === "content-filter")
    return true;
  if (reason && typeof reason === "object" && "unified" in reason) {
    return isCompletedTurnFinish((reason as { unified: unknown }).unified);
  }
  return false;
}

function finishReasonOf(part: {
  type: string;
  finishReason?: unknown;
}): unknown {
  return "finishReason" in part ? part.finishReason : undefined;
}

export function harnessErrorText(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return nestedErrorMessage(err.message) ?? err.message;
  }
  return nestedErrorMessage(err) ?? "The assistant hit an error.";
}

function nestedErrorMessage(err: unknown): string | null {
  if (typeof err === "string" && err.trim()) {
    const trimmed = err.trim();
    if (trimmed.startsWith("{")) {
      try {
        return nestedErrorMessage(JSON.parse(trimmed) as unknown);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; data?: { message?: unknown } };
    if (typeof rec.data?.message === "string" && rec.data.message.trim())
      return rec.data.message;
    if (typeof rec.message === "string" && rec.message.trim())
      return nestedErrorMessage(rec.message) ?? rec.message;
  }
  return null;
}

/**
 * OpenCode sometimes emits a bare `{type:"error"}` after `finish-step`
 * `stop` (unhandledRejection: undefined). The harness treats that as a
 * fatal stream error; the assistant text is already complete. Drop it.
 * Mid-turn errors (before a stop step) still flow through.
 */
export function dropTrailingHarnessErrors<
  T extends { type: string; finishReason?: unknown },
>(stream: ReadableStream<T>): ReadableStream<T> {
  let turnStopped = false;
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(part, controller) {
        if (
          part.type === "finish-step" &&
          isCompletedTurnFinish(finishReasonOf(part))
        ) {
          turnStopped = true;
        }
        if (part.type === "error" && turnStopped) {
          console.error("[chat] dropped trailing harness error after stop");
          return;
        }
        controller.enqueue(part);
      },
    })
  );
}

/** A `{type:"error"}` chunk never becomes a message part. Turn it into one. */
export function harnessErrorsAsTurnParts<
  T extends { type: string; errorText?: string },
>(
  stream: ReadableStream<T>
): ReadableStream<T | { type: "data-error"; data: { message: string } }> {
  return stream.pipeThrough(
    new TransformStream({
      transform(part, controller) {
        if (part.type === "error") {
          const message =
            typeof part.errorText === "string" && part.errorText.trim()
              ? part.errorText
              : "The assistant hit an error.";
          controller.enqueue({ type: "data-error", data: { message } });
          return;
        }
        controller.enqueue(part);
      },
    })
  );
}
