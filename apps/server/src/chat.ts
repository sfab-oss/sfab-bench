import type {
  HarnessAgentResumeSessionState,
  HarnessAgentSession,
} from "@ai-sdk/harness/agent";
import {
  type ChatEffort,
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS,
  DEFAULT_HARNESS_MODEL,
  emptySnapshot,
  type HarnessId,
  isChatEffort,
  isHarnessId,
  type ViewerSnapshot,
} from "@sfab-bench/contract";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  lastAssistantMessageIsCompleteWithToolCalls,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getAgent } from "./agent";
import { messagesToPersist, withTurnError } from "./chat-persist";
import {
  dropTrailingHarnessErrors,
  harnessErrorsAsTurnParts,
  harnessErrorText,
} from "./chat-stream";
import { ensureProvisioned } from "./provisioning";
import { endSessionRun, rememberOpenedFile, startSessionRun } from "./session";
import {
  isResumePayload,
  isUnusableResumeError,
  LOST_CONTEXT_LINE,
  lostContext,
  nativeIdFromResume,
  resumeFromStored,
  shouldPersistPark,
  stripResumeCredentials,
} from "./thread-sessions";
import {
  dropThreadSession,
  loadThreadSession,
  saveMessages,
  saveThreadSession,
} from "./threads-db";
import { runViewerContext } from "./viewer-context";

const sessions = new Map<string, Promise<HarnessAgentSession>>();

function sessionKey(root: string, harness: HarnessId, chatId: string) {
  return `${root}:${harness}:${chatId}`;
}

export function priorMessages(
  continueTurn: boolean,
  bodyMessages: UIMessage[],
  stamped: UIMessage
): UIMessage[] {
  // Tool continuations must send the full client payload. A normal turn is the
  // last user message only: the harness collapses any array to that anyway
  // (`_resolvePromptTurnInput`). Sqlite history does not restore vendor memory.
  return continueTurn ? bodyMessages : [stamped];
}

function persistChat(chatId: string, next: UIMessage[], root: string) {
  try {
    const ok = saveMessages(chatId, root, next);
    if (!ok) console.error("[chat] persist skipped (no thread)", chatId);
  } catch (err) {
    console.error("[chat] persist failed", err);
  }
}

async function createLiveSession(
  root: string,
  harness: HarnessId,
  chatId: string,
  effort: ChatEffort,
  resumeFrom?: HarnessAgentResumeSessionState
) {
  return getAgent(harness, effort, root).createSession({
    sessionId: chatId,
    ...(resumeFromStored(resumeFrom) as {
      resumeFrom?: HarnessAgentResumeSessionState;
    }),
  });
}

async function sessionFor(
  root: string,
  harness: HarnessId,
  chatId: string,
  effort: ChatEffort
): Promise<{ session: HarnessAgentSession; lostContext: boolean }> {
  const key = sessionKey(root, harness, chatId);
  const pending = sessions.get(key);
  if (pending) return { session: await pending, lostContext: false };

  const stored = loadThreadSession(chatId, harness);
  let resumeFrom: HarnessAgentResumeSessionState | undefined;
  let lost = false;
  if (stored) {
    if (!isResumePayload(stored.state)) {
      dropThreadSession(chatId, harness);
      lost = true;
    } else {
      resumeFrom = stored.state as HarnessAgentResumeSessionState;
    }
  }

  const start = async () => {
    if (!resumeFrom) return createLiveSession(root, harness, chatId, effort);
    try {
      return await createLiveSession(root, harness, chatId, effort, resumeFrom);
    } catch (err) {
      if (!isUnusableResumeError(err)) throw err;
      dropThreadSession(chatId, harness);
      lost = true;
      return createLiveSession(root, harness, chatId, effort);
    }
  };

  const promise = start().catch((err) => {
    sessions.delete(key);
    throw err;
  });
  sessions.set(key, promise);
  return { session: await promise, lostContext: lost };
}

type ChatBody = {
  id?: string;
  messages: UIMessage[];
  viewerFile?: string;
  viewer?: ViewerSnapshot;
  model?: string;
  harness?: string;
  effort?: string;
};

function stampUser(last: UIMessage, snapshot: ViewerSnapshot): UIMessage {
  const bits = [`file=${snapshot.file || "(none)"}`];
  if (snapshot.empty) bits.push("empty");
  if (snapshot.selected) bits.push(`selected=${snapshot.selected}`);
  const stamp = `[viewer] ${bits.join(" ")}`;
  const parts = last.parts ?? [];
  const texts = parts.filter((p) => p.type === "text");
  if (texts.length === 0)
    return {
      ...last,
      parts: [...parts, { type: "text" as const, text: stamp }],
    };
  let used = false;
  return {
    ...last,
    parts: parts.map((p) => {
      if (p.type !== "text" || used) return p;
      used = true;
      return { ...p, type: "text" as const, text: `${p.text}\n\n${stamp}` };
    }),
  };
}

/**
 * The client resubmits a tool turn when the SDK's own predicate says so
 * (`sendAutomaticallyWhen` in ChatSession/XrChatRuntime), so this gate has to
 * be that same predicate — not a copy of it. The copy had drifted twice: it
 * judged every part instead of only the last step, and it counted
 * provider-executed tools, which the harness runs itself and never reports a
 * result for. A model emitting a provider `bash` alongside one of our viewer
 * tools therefore resubmitted and got "expected a user message or tool result".
 */
export function lastIsToolContinuation(last: UIMessage): boolean {
  return lastAssistantMessageIsCompleteWithToolCalls({ messages: [last] });
}

export async function handleChat(
  req: Request,
  root: string
): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const chatId = body.id?.trim();
  if (!chatId) {
    return new Response("missing thread id", { status: 400 });
  }
  const requestedHarness = body.harness || DEFAULT_HARNESS;
  const harness: HarnessId = isHarnessId(requestedHarness)
    ? requestedHarness
    : DEFAULT_HARNESS;
  const requestedEffort = body.effort || DEFAULT_CHAT_EFFORT;
  const effort: ChatEffort = isChatEffort(requestedEffort)
    ? requestedEffort
    : DEFAULT_CHAT_EFFORT;
  const last = body.messages?.at(-1);
  if (!last) {
    return new Response("missing message", { status: 400 });
  }

  // First use installs the harness bridge. Wait for it here, so a failed
  // install is a plain send failure with the prompt kept, not a dead turn.
  const installFailed = await ensureProvisioned(root, harness);
  if (installFailed) return new Response(installFailed, { status: 503 });

  // That wait is the longest gap in the handler, and `abort` does not replay
  // for a listener added afterwards — so a stop during the install would
  // otherwise be dropped and start a turn nobody is waiting for, locking the
  // folder to 409 until it ends. We drop out here instead of passing the
  // signal into the install: the install is shared, and one folder giving up
  // must not cancel it for another.
  if (req.signal.aborted) return new Response(null, { status: 499 });

  const run = startSessionRun(root);
  if (!run) {
    return new Response("a reply is already in progress", { status: 409 });
  }
  req.signal.addEventListener("abort", () => run.abort());

  const snapshot: ViewerSnapshot =
    body.viewer ?? emptySnapshot(body.viewerFile ?? "");
  const continueTurn = lastIsToolContinuation(last);
  if (last.role !== "user" && !continueTurn) {
    return new Response("expected a user message or tool result", {
      status: 400,
    });
  }
  const stamped = continueTurn ? last : stampUser(last, snapshot);
  const history = body.messages.slice(0, -1);
  const live = [...history, last];

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const key = sessionKey(root, harness, chatId);
        let session: HarnessAgentSession | undefined;
        try {
          await runViewerContext(
            {
              root,
              file: snapshot.file,
              snapshot,
              show: (file) => {
                rememberOpenedFile(file, root);
                writer.write({ type: "data-viewer", data: { file } });
              },
            },
            async () => {
              const agent = getAgent(harness, effort, root);
              const resolved = await sessionFor(root, harness, chatId, effort);
              session = resolved.session;
              if (resolved.lostContext) {
                writer.write({
                  type: "data-error",
                  data: { message: LOST_CONTEXT_LINE },
                });
              }
              const model =
                typeof body.model === "string" && body.model.trim()
                  ? body.model.trim()
                  : DEFAULT_HARNESS_MODEL[harness];
              const prior = priorMessages(continueTurn, body.messages, stamped);
              const result = await agent.stream({
                session,
                messages: await convertToModelMessages(prior),
                options: { model },
                abortSignal: run.signal,
              });
              const ui = harnessErrorsAsTurnParts(
                toUIMessageStream({
                  stream: dropTrailingHarnessErrors(
                    result.stream as never
                  ) as never,
                  onError: harnessErrorText,
                }) as never
              );
              writer.merge(ui as never);
              try {
                await result.text;
              } catch {
                /* stream failed; idle-check below still applies */
              }
            }
          );

          if (!session || run.signal.aborted) return;
          // do not detach during get_viewer — the live handle stays in the Map
          if (session.hasUnfinishedTurn()) return;
          let payload: HarnessAgentResumeSessionState;
          try {
            payload = await session.detach();
          } finally {
            sessions.delete(key);
          }
          if (
            !shouldPersistPark({
              unfinished: false,
              aborted: run.signal.aborted,
              continueFrom: payload.continueFrom,
            })
          ) {
            return;
          }
          const stripped = stripResumeCredentials(payload);
          const nextNative = nativeIdFromResume(harness, stripped);
          const prev = loadThreadSession(chatId, harness);
          saveThreadSession(chatId, root, harness, stripped, nextNative);
          if (lostContext(prev?.native_id, nextNative)) {
            writer.write({
              type: "data-error",
              data: { message: LOST_CONTEXT_LINE },
            });
          }
        } catch (err) {
          if (!run.signal.aborted) {
            writer.write({
              type: "data-error",
              data: { message: harnessErrorText(err) },
            });
          }
        } finally {
          endSessionRun(root);
        }
      },
      onFinish: ({ responseMessage, isAborted, outcome }) => {
        let assistant: UIMessage | undefined = responseMessage;
        if (isAborted && (responseMessage.parts ?? []).length === 0) {
          persistChat(chatId, live, root);
          return;
        }
        if (outcome.status === "failed") {
          assistant = withTurnError(
            responseMessage,
            harnessErrorText(outcome.error)
          );
        }
        persistChat(chatId, messagesToPersist(live, assistant), root);
      },
      onError: harnessErrorText,
    }),
  });
}
