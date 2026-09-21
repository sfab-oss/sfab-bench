import type { ChatAddToolOutputFunction } from "ai";
import { useEffect, useRef } from "react";

import {
  findPendingGetDevice,
  GET_DEVICE_TOOL,
  shownDeviceFromPart,
} from "@/chat/device-tools";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { deviceUrl, syncDeviceQuery } from "@/lib/device-query";

/** Show run_firmware on this tab, then fill a pending get_device from ?device=. */
export function useLiveDeviceTools(
  messages: GalleryChatMessage[],
  addToolOutput: ChatAddToolOutputFunction<GalleryChatMessage>,
  streaming: boolean,
  onFilled?: () => void | Promise<void>,
  enabled = true
) {
  const seen = useRef(new Set<string>());
  const inFlight = useRef<string | null>(null);
  const onFilledRef = useRef(onFilled);
  onFilledRef.current = onFilled;

  useEffect(() => {
    if (!enabled) return;
    const last = messages.at(-1);
    const pendingOnLast =
      last?.role === "assistant" &&
      (last.parts ?? []).some((part) => {
        if (!part || typeof part !== "object") return false;
        const state = (part as { state?: string }).state;
        return state === "input-available" || state === "input-streaming";
      });
    if (streaming || pendingOnLast) {
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
    }

    const pending = findPendingGetDevice(messages);
    if (!pending) return;
    if (inFlight.current === pending.toolCallId) return;
    inFlight.current = pending.toolCallId;
    let cancelled = false;
    const open = deviceUrl();

    void (async () => {
      if (cancelled) return;
      await addToolOutput({
        tool: GET_DEVICE_TOOL,
        toolCallId: pending.toolCallId,
        output: { device: open || null },
      });
      await onFilledRef.current?.();
    })();

    return () => {
      cancelled = true;
      if (inFlight.current === pending.toolCallId) inFlight.current = null;
    };
  }, [addToolOutput, enabled, messages, streaming]);
}
