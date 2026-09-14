import { useEffect, useRef } from "react";
import { getToolName, isToolUIPart } from "ai";

import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { store } from "@/state/store";

function shownFromPart(part: GalleryChatMessage["parts"][number], index: number, messageId: string) {
  if (part.type === "data-viewer" && part.data && typeof part.data.file === "string" && part.data.file) {
    return { key: `${messageId}:viewer:${index}:${part.data.file}`, file: part.data.file };
  }
  if (isToolUIPart(part) && getToolName(part) === "show_artifact" && part.state === "output-available") {
    const output = part.output as { shown?: unknown } | undefined;
    if (typeof output?.shown === "string" && output.shown) {
      return { key: `${messageId}:tool:${"toolCallId" in part ? String(part.toolCallId) : index}`, file: output.shown };
    }
  }
  return null;
}

/** Load show_artifact results on this client only, and only while this chat is live. */
export function useLiveShowArtifact(messages: GalleryChatMessage[], live: boolean) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!live) return;
    for (const message of messages) {
      (message.parts ?? []).forEach((part, index) => {
        const shown = shownFromPart(part, index, message.id);
        if (!shown || seen.current.has(shown.key)) return;
        seen.current.add(shown.key);
        void store.getState().loadModel(shown.file);
      });
    }
  }, [messages, live]);
}
