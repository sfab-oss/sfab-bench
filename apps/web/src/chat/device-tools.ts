import {
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
} from "ai";

export const GET_DEVICE_TOOL = "get_device";
export const RUN_FIRMWARE_TOOL = "run_firmware";

function partToolName(part: {
  type: string;
  toolName?: string;
}): string | null {
  if (typeof part.toolName === "string" && part.toolName) return part.toolName;
  if (part.type === "dynamic-tool") {
    return getToolName(part as DynamicToolUIPart);
  }
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  if (isToolUIPart(part as ToolUIPart)) return getToolName(part as ToolUIPart);
  return null;
}

export type ShownDevice = { key: string; device: string };

export function shownDeviceFromPart(
  part: {
    type: string;
    toolName?: string;
    toolCallId?: string;
    data?: { device?: unknown };
    output?: unknown;
    state?: string;
  },
  index: number,
  messageId: string
): ShownDevice | null {
  if (
    part.type === "data-device" &&
    part.data &&
    typeof part.data.device === "string" &&
    part.data.device
  ) {
    return {
      key: `${messageId}:device:${index}:${part.data.device}`,
      device: part.data.device,
    };
  }
  if (
    partToolName(part) === RUN_FIRMWARE_TOOL &&
    part.state === "output-available"
  ) {
    const output = part.output as { running?: unknown } | undefined;
    if (typeof output?.running === "string" && output.running) {
      return {
        key: `${messageId}:tool:${part.toolCallId ?? index}`,
        device: output.running,
      };
    }
  }
  return null;
}

export function findPendingGetDevice(
  messages: Array<{ role: string; parts?: readonly unknown[] }>
): { toolCallId: string } | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts ?? []) {
    if (!part || typeof part !== "object") continue;
    const row = part as {
      type: string;
      toolName?: string;
      state?: string;
      toolCallId?: string;
    };
    if (partToolName(row) !== GET_DEVICE_TOOL) continue;
    if (row.state !== "input-available") continue;
    if (!row.toolCallId) continue;
    return { toolCallId: row.toolCallId };
  }
  return null;
}
