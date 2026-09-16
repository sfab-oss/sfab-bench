import { type HarnessAgentSession } from "@ai-sdk/harness/agent";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import {
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS,
  DEFAULT_HARNESS_MODEL,
  isChatEffort,
  isHarnessId,
  type ChatEffort,
  type HarnessId,
} from "@sfab-bench/contract";
import { emptySnapshot, type ViewerSnapshot } from "@sfab-bench/contract";
import { getAgent } from "./agent";
import { ensureProvisioned } from "./provisioning";
import {
  endSessionRun,
  rememberOpenedFile,
  setSessionRunStatus,
  startSessionRun,
} from "./session";
import { dropTrailingHarnessErrors, harnessErrorText, harnessErrorsAsTurnParts } from "./chat-stream";
import { messagesToPersist, withTurnError } from "./chat-persist";
import { saveMessages } from "./threads-db";
import { runViewerContext } from "./viewer-context";

const sessions = new Map<string, Promise<HarnessAgentSession>>();

function sessionKey(root: string, harness: HarnessId, chatId: string, effort: ChatEffort) {
  return `${root}:${harness}:${effort}:${chatId}`;
}

export function resetChatSessions() {
  sessions.clear();
}

function sessionFor(root: string, harness: HarnessId, chatId: string, effort: ChatEffort) {
  const key = sessionKey(root, harness, chatId, effort);
  let pending = sessions.get(key);
  if (!pending) {
    pending = getAgent(harness, effort, root)
      // Thread id only. Effort in this string became a colon in the session folder name.
      .createSession({ sessionId: chatId })
      .catch((err) => {
        sessions.delete(key);
        throw err;
      });
    sessions.set(key, pending);
  }
  return pending;
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
  if (texts.length === 0) return { ...last, parts: [...parts, { type: "text" as const, text: stamp }] };
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

function lastIsToolContinuation(last: UIMessage): boolean {
  if (last.role !== "assistant") return false;
  const tools = (last.parts ?? []).filter(
    (part) => part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-")),
  );
  if (tools.length === 0) return false;
  return tools.every(
    (part) => "state" in part && (part.state === "output-available" || part.state === "output-error"),
  );
}

function persistChat(chatId: string, next: UIMessage[], root: string) {
  try {
    const ok = saveMessages(chatId, root, next);
    if (!ok) console.error("[chat] persist skipped (no thread)", chatId);
  } catch (err) {
    console.error("[chat] persist failed", err);
  }
}

export async function handleChat(req: Request, root: string): Promise<Response> {
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
  const harness: HarnessId = isHarnessId(requestedHarness) ? requestedHarness : DEFAULT_HARNESS;
  const requestedEffort = body.effort || DEFAULT_CHAT_EFFORT;
  const effort: ChatEffort = isChatEffort(requestedEffort) ? requestedEffort : DEFAULT_CHAT_EFFORT;
  const last = body.messages?.at(-1);
  if (!last) {
    return new Response("missing message", { status: 400 });
  }

  // First use installs the harness bridge. Wait for it here, so a failed
  // install is a plain send failure with the prompt kept, not a dead turn.
  const installFailed = await ensureProvisioned(root, harness);
  if (installFailed) return new Response(installFailed, { status: 503 });

  const run = startSessionRun(root);
  if (!run) {
    return new Response("a reply is already in progress", { status: 409 });
  }
  req.signal.addEventListener("abort", () => run.abort());

  const snapshot: ViewerSnapshot = body.viewer ?? emptySnapshot(body.viewerFile ?? "");
  const continueTurn = lastIsToolContinuation(last);
  if (last.role !== "user" && !continueTurn) {
    return new Response("expected a user message or tool result", { status: 400 });
  }
  const stamped = continueTurn ? last : stampUser(last, snapshot);
  const history = body.messages.slice(0, -1);
  const live = [...history, last];

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
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
              const key = sessionKey(root, harness, chatId, effort);
              const isNew = !sessions.has(key);
              const agent = getAgent(harness, effort, root);
              const session = await sessionFor(root, harness, chatId, effort);
              const model =
                typeof body.model === "string" && body.model.trim()
                  ? body.model.trim()
                  : DEFAULT_HARNESS_MODEL[harness];
              const prior = continueTurn
                ? body.messages
                : isNew
                  ? [...history, stamped]
                  : [stamped];
              const result = await agent.stream({
                session,
                messages: await convertToModelMessages(prior),
                options: { model },
                abortSignal: run.signal,
              });
              const ui = harnessErrorsAsTurnParts(
                toUIMessageStream({
                  stream: dropTrailingHarnessErrors(result.stream as never) as never,
                  onError: harnessErrorText,
                }) as never,
              );
              setSessionRunStatus(root, "streaming");
              writer.merge(ui as never);
            },
          );
        } catch (err) {
          if (!run.signal.aborted) {
            writer.write({ type: "data-error", data: { message: harnessErrorText(err) } });
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
          assistant = withTurnError(responseMessage, harnessErrorText(outcome.error));
        }
        persistChat(chatId, messagesToPersist(live, assistant), root);
      },
      onError: harnessErrorText,
    }),
  });
}
