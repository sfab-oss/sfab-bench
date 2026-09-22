import { useEffect, useRef } from "react";

import { shownFromPart } from "@/chat/get-viewer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { store } from "@/state/store";

/** Load show_artifact on this client. The tool result is filled in onToolCall. */
export function useLiveViewerTools(
  messages: GalleryChatMessage[],
  streaming: boolean,
  enabled = true
) {
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !streaming) return;
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
  }, [enabled, messages, streaming]);
}
