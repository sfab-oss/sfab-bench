/** Terminal model step — not a tool pause and not a failed step. */
export function isCompletedTurnFinish(reason: unknown): boolean {
  if (reason === "stop" || reason === "length" || reason === "content-filter") return true;
  if (reason && typeof reason === "object" && "unified" in reason) {
    return isCompletedTurnFinish((reason as { unified: unknown }).unified);
  }
  return false;
}

function finishReasonOf(part: { type: string; finishReason?: unknown }): unknown {
  return "finishReason" in part ? part.finishReason : undefined;
}

/**
 * OpenCode sometimes emits a bare `{type:"error"}` after `finish-step`
 * `stop` (unhandledRejection: undefined). The harness treats that as a
 * fatal stream error; the assistant text is already complete. Drop it.
 * Mid-turn errors (before a stop step) still flow through.
 */
export function dropTrailingHarnessErrors<T extends { type: string; finishReason?: unknown }>(
  stream: ReadableStream<T>,
): ReadableStream<T> {
  let turnStopped = false;
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(part, controller) {
        if (part.type === "finish-step" && isCompletedTurnFinish(finishReasonOf(part))) {
          turnStopped = true;
        }
        if (part.type === "error" && turnStopped) {
          console.error("[chat] dropped trailing harness error after stop");
          return;
        }
        controller.enqueue(part);
      },
    }),
  );
}
