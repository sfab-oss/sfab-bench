import { getHarnessErrorMessage, type HarnessAgentSession } from "@ai-sdk/harness/agent";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
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
import { projectPath } from "./projects";
import {
  endSessionRun,
  persistSessionThread,
  publishSessionThread,
  sessionState,
  setSessionDoc,
  setSessionRunStatus,
  startSessionRun,
  viewerStamp,
} from "./session";
import { runViewerContext } from "./viewer-context";

const sessions = new Map<string, Promise<HarnessAgentSession>>();

function sessionKey(harness: HarnessId, chatId: string, effort: ChatEffort) {
  return `${projectPath()}:${harness}:${effort}:${chatId}`;
}

export function resetChatSessions() {
  sessions.clear();
}

function sessionFor(harness: HarnessId, chatId: string, effort: ChatEffort) {
  const key = sessionKey(harness, chatId, effort);
  let pending = sessions.get(key);
  if (!pending) {
    pending = getAgent(harness, effort)
      .createSession({ sessionId: `${chatId}:${effort}` })
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
      return { ...p, text: `${p.text}\n\n${stamp}` };
    }),
  };
}

export async function handleChat(req: Request): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const chatId = body.id ?? sessionState().threadId ?? "sphere-chat";
  const prefs = sessionState().thread;
  const requestedHarness = body.harness || prefs.harness;
  const harness: HarnessId = isHarnessId(requestedHarness) ? requestedHarness : DEFAULT_HARNESS;
  const requestedEffort = body.effort || prefs.effort;
  const effort: ChatEffort = isChatEffort(requestedEffort) ? requestedEffort : DEFAULT_CHAT_EFFORT;
  const last = body.messages?.at(-1);
  if (!last) {
    return new Response("missing message", { status: 400 });
  }

  const run = startSessionRun();
  if (!run) {
    return new Response("a reply is already in progress", { status: 409 });
  }
  req.signal.addEventListener("abort", () => run.abort());

  const stamp = viewerStamp();
  const snapshot: ViewerSnapshot = {
    ...(body.viewer ?? emptySnapshot(stamp.file)),
    file: stamp.file,
    empty: stamp.empty,
    selected: stamp.selected,
    selectedName: stamp.selectedName,
  };
  const stamped = stampUser(last, snapshot);
  const history = body.messages.slice(0, -1);
  const live = [...history, last];
  publishSessionThread(live, "submitted", true);

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          await runViewerContext(
            {
              file: stamp.file,
              snapshot,
              show: (file) => {
                setSessionDoc(file, { reload: true, skipResolve: true });
              },
            },
            async () => {
              const key = sessionKey(harness, chatId, effort);
              const isNew = !sessions.has(key);
              const agent = getAgent(harness, effort);
              const session = await sessionFor(harness, chatId, effort);
              const model =
                typeof body.model === "string" && body.model.trim()
                  ? body.model.trim()
                  : prefs.model || DEFAULT_HARNESS_MODEL[harness];
              const prior = isNew ? [...history, stamped] : [stamped];
              const result = await agent.stream({
                session,
                messages: await convertToModelMessages(prior),
                options: { model },
                abortSignal: run.signal,
              });
              const ui = toUIMessageStream({
                stream: result.stream as never,
                onError: getHarnessErrorMessage,
              });
              const [toClient, toFan] = ui.tee();
              const fan = (async () => {
                let assistant: UIMessage | undefined;
                try {
                  for await (const msg of readUIMessageStream({ stream: toFan })) {
                    assistant = msg;
                    setSessionRunStatus("streaming");
                    publishSessionThread([...live, msg], "streaming");
                  }
                } catch {
                  /* abort or stream error — persist what we have */
                }
                const next = assistant ? [...live, assistant] : live;
                persistSessionThread(next);
                publishSessionThread(next, "idle", true);
              })();
              writer.merge(toClient);
              await fan;
            },
          );
        } finally {
          endSessionRun();
        }
      },
      onError: (err) => (err instanceof Error ? err.message : String(err)),
    }),
  });
}
