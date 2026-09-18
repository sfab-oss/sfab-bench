import type { ChatAddToolOutputFunction } from "ai";
import { useEffect, useRef } from "react";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import {
  findPendingGetViewer,
  GET_VIEWER_TOOL,
  latestShownArtifact,
  shownFromPart,
  viewerIsReady,
} from "@/chat/get-viewer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { store } from "@/state/store";

function lastAssistantHasPendingTools(messages: GalleryChatMessage[]) {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  for (const part of last.parts ?? []) {
    if (!part || typeof part !== "object") continue;
    const row = part as { type?: string; state?: string };
    const toolish =
      row.type === "dynamic-tool" ||
      (typeof row.type === "string" && row.type.startsWith("tool-"));
    if (!toolish) continue;
    if (row.state === "input-available" || row.state === "input-streaming")
      return true;
  }
  return false;
}

function waitUntilReady(
  target: string | null,
  isCancelled: () => boolean
): Promise<void> {
  if (isCancelled() || viewerIsReady(store.getState(), target))
    return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.subscribe((state) => {
      if (isCancelled() || viewerIsReady(state, target)) {
        unsub();
        resolve();
      }
    });
    if (isCancelled() || viewerIsReady(store.getState(), target)) {
      unsub();
      resolve();
    }
  });
}

/** Load show_artifact on this client, then fill a pending get_viewer from this tab's scene. */
export function useLiveViewerTools(
  messages: GalleryChatMessage[],
  addToolOutput: ChatAddToolOutputFunction<GalleryChatMessage>,
  streaming: boolean,
  onFilled?: () => void | Promise<void>
) {
  const seen = useRef(new Set<string>());
  const inFlight = useRef<string | null>(null);
  const onFilledRef = useRef(onFilled);
  onFilledRef.current = onFilled;

  useEffect(() => {
    const applyShows = streaming || lastAssistantHasPendingTools(messages);
    if (applyShows) {
      for (const message of messages) {
        (message.parts ?? []).forEach((part, index) => {
          const shown = shownFromPart(
            part as Parameters<typeof shownFromPart>[0],
            index,
            message.id
          );
          if (!shown || seen.current.has(shown.key)) return;
          seen.current.add(shown.key);
          void store.getState().loadModel(shown.file);
        });
      }
    }

    const pending = findPendingGetViewer(messages);
    if (!pending) return;

    const target = latestShownArtifact(messages);
    if (target && store.getState().url !== target) {
      void store.getState().loadModel(target);
    }

    if (inFlight.current === pending.toolCallId) return;
    inFlight.current = pending.toolCallId;
    let cancelled = false;

    void (async () => {
      await waitUntilReady(target, () => cancelled);
      if (cancelled) return;
      await addToolOutput({
        tool: GET_VIEWER_TOOL,
        toolCallId: pending.toolCallId,
        output: viewerSnapshot(),
      });
      await onFilledRef.current?.();
    })();

    return () => {
      cancelled = true;
      if (inFlight.current === pending.toolCallId) inFlight.current = null;
    };
  }, [addToolOutput, messages, streaming]);
}
