import type { ChatAddToolOutputFunction } from "ai";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import { GET_DEVICE_TOOL } from "@/chat/device-tools";
import {
  GET_VIEWER_TOOL,
  latestShownArtifact,
  viewerIsReady,
} from "@/chat/get-viewer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { deviceUrl } from "@/lib/device-query";
import type { Experience } from "@/lib/experience";
import { store } from "@/state/store";

export function assistantHasUnresolvedTool(
  messages: Array<{ role: string; parts?: readonly unknown[] }>
): boolean {
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

/** Fill get_viewer or get_device. Do not await addToolOutput. */
export function answerClientTool(
  toolCall: { dynamic?: boolean; toolName: string; toolCallId: string },
  addToolOutput: ChatAddToolOutputFunction<GalleryChatMessage>,
  mode: Experience,
  shownFile: () => string | null
) {
  if (toolCall.dynamic) return;
  if (mode === "device" && toolCall.toolName === GET_DEVICE_TOOL) {
    addToolOutput({
      tool: GET_DEVICE_TOOL,
      toolCallId: toolCall.toolCallId,
      output: { device: deviceUrl() || null },
    });
    return;
  }
  if (mode !== "device" && toolCall.toolName === GET_VIEWER_TOOL) {
    const toolCallId = toolCall.toolCallId;
    void (async () => {
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
}

export function shownFileFrom(messages: GalleryChatMessage[]): string | null {
  return latestShownArtifact(messages);
}
