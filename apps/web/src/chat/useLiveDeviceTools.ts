import { useEffect, useRef } from "react";

import { shownDeviceFromPart } from "@/chat/device-tools";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { syncDeviceQuery } from "@/lib/device-query";

/** Open the console for run_firmware. The tool result is filled in onToolCall. */
export function useLiveDeviceTools(
  messages: GalleryChatMessage[],
  streaming: boolean,
  enabled = true
) {
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !streaming) return;
    for (const message of messages) {
      (message.parts ?? []).forEach((part, index) => {
        const shown = shownDeviceFromPart(
          part as Parameters<typeof shownDeviceFromPart>[0],
          index,
          message.id
        );
        if (!shown || seen.current.has(shown.key)) return;
        seen.current.add(shown.key);
        syncDeviceQuery(shown.device);
      });
    }
  }, [enabled, messages, streaming]);
}
