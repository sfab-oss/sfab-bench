import type { ChatAddToolOutputFunction } from "ai";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import { findPendingGetDevice, GET_DEVICE_TOOL } from "@/chat/device-tools";
import {
  findPendingGetViewer,
  GET_VIEWER_TOOL,
  latestShownArtifact,
  viewerIsReady,
} from "@/chat/get-viewer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { deviceUrl } from "@/lib/device-query";
import type { Experience } from "@/lib/experience";
import { store } from "@/state/store";

type ToolCall = {
  dynamic?: boolean;
  toolName: string;
  toolCallId: string;
};

function waitUntilReady(target: string | null): Promise<void> {
  if (viewerIsReady(store.getState(), target)) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.subscribe((state) => {
      if (viewerIsReady(state, target)) {
        unsub();
        resolve();
      }
    });
    if (viewerIsReady(store.getState(), target)) {
      unsub();
      resolve();
    }
  });
}

/** Fill get_viewer or get_device. Do not await addToolOutput. Resolves when the output is sent. */
export function answerClientTool(
  toolCall: ToolCall,
  addToolOutput: ChatAddToolOutputFunction<GalleryChatMessage>,
  mode: Experience,
  shownFile: () => string | null
): Promise<void> | null {
  if (toolCall.dynamic) return null;
  if (mode === "device" && toolCall.toolName === GET_DEVICE_TOOL) {
    addToolOutput({
      tool: GET_DEVICE_TOOL,
      toolCallId: toolCall.toolCallId,
      output: { device: deviceUrl() || null },
    });
    return Promise.resolve();
  }
  if (mode !== "device" && toolCall.toolName === GET_VIEWER_TOOL) {
    const toolCallId = toolCall.toolCallId;
    return (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const target = shownFile();
      if (target && store.getState().url !== target) {
        void store.getState().loadModel(target);
      }
      await waitUntilReady(target);
      addToolOutput({
        tool: GET_VIEWER_TOOL,
        toolCallId,
        output: viewerSnapshot(),
      });
    })();
  }
  return null;
}

/**
 * Fill a leftover get_viewer or get_device once the stream is idle, and the
 * live call too. Enter waits only while that fill is in flight.
 */
export function useClientToolFill(
  messages: GalleryChatMessage[],
  busy: boolean,
  mode: Experience,
  addToolOutputRef: RefObject<ChatAddToolOutputFunction<GalleryChatMessage> | null>,
  messagesRef: RefObject<GalleryChatMessage[]>
) {
  const started = useRef(new Set<string>());
  const [filling, setFilling] = useState(0);
  const begin = useCallback(
    (toolCall: ToolCall) => {
      if (!toolCall.toolCallId || started.current.has(toolCall.toolCallId))
        return;
      const add = addToolOutputRef.current;
      if (!add) return;
      const job = answerClientTool(toolCall, add, mode, () =>
        shownFileFrom(messagesRef.current ?? [])
      );
      if (!job) return;
      started.current.add(toolCall.toolCallId);
      setFilling((count) => count + 1);
      void job.finally(() => setFilling((count) => count - 1));
    },
    [addToolOutputRef, messagesRef, mode]
  );

  useEffect(() => {
    if (busy) return;
    const pending =
      mode === "device"
        ? findPendingGetDevice(messages)
        : findPendingGetViewer(messages);
    if (!pending) return;
    begin({
      toolName: mode === "device" ? GET_DEVICE_TOOL : GET_VIEWER_TOOL,
      toolCallId: pending.toolCallId,
    });
  }, [begin, busy, messages, mode]);

  return { filling: filling > 0, begin };
}

export function shownFileFrom(messages: GalleryChatMessage[]): string | null {
  return latestShownArtifact(messages);
}
