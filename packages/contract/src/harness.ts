export const HARNESS_IDS = ["opencode", "codex", "cursor", "grok-build"] as const;

export type HarnessId = (typeof HARNESS_IDS)[number];

export function isHarnessId(value: string): value is HarnessId {
  return (HARNESS_IDS as readonly string[]).includes(value);
}

export const HARNESS_LABEL: Record<HarnessId, string> = {
  opencode: "OpenCode",
  codex: "Codex",
  cursor: "Cursor",
  "grok-build": "Grok",
};

export const DEFAULT_HARNESS: HarnessId = "opencode";

/** Intersection of OpenCode / Codex / Grok reasoning knobs. Cursor has none. */
export const CHAT_EFFORTS = ["default", "low", "medium", "high"] as const;
export type ChatEffort = (typeof CHAT_EFFORTS)[number];

export const DEFAULT_CHAT_EFFORT: ChatEffort = "default";

export const CHAT_EFFORT_LABEL: Record<ChatEffort, string> = {
  default: "Default",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function isChatEffort(value: string): value is ChatEffort {
  return (CHAT_EFFORTS as readonly string[]).includes(value);
}

export function harnessSupportsEffort(id: HarnessId) {
  return id !== "cursor";
}

export const DEFAULT_HARNESS_MODEL: Record<HarnessId, string> = {
  opencode: "zai-coding-plan/glm-5.3-flash",
  codex: "gpt-5.5",
  cursor: "gpt-5.6-luna",
  "grok-build": "grok-4.6",
};

export const STATIC_HARNESS_MODELS: Record<Exclude<HarnessId, "opencode">, { id: string; name: string }[]> = {
  codex: [
    { id: "gpt-5.5", name: "GPT-5.5" },
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  ],
  cursor: [
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
    { id: "claude-4.6-sonnet-medium", name: "Claude 4.6 Sonnet" },
    { id: "grok-4.6", name: "Grok 4.6" },
  ],
  "grok-build": [
    { id: "grok-4.6", name: "Grok 4.6" },
    { id: "grok-4.5", name: "Grok 4.5" },
    { id: "grok-code", name: "Grok Code" },
  ],
};
