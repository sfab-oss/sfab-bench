import type { JSONContent } from "@tiptap/react";

import { parseCadRefs, resolveCadRef } from "@/chat/cad-refs";
import { providerLoginSendReason } from "@/chat/model-picker";

/** Workspace mutex (ADR 0003). Server body is "a reply is already in progress". */
export const WORKSPACE_BUSY_MESSAGE = "a reply is already in progress in this folder";

export const LOADING_MODEL_PLACEHOLDER = "Loading the model into this tab…";
export const EMPTY_PROMPT_REASON = "Enter a message to send";
export const COMPOSER_HINT = "Enter to send · Shift+Enter for a new line";
export const DEFAULT_PLACEHOLDER = "Ask for a change…";
export const MENTION_PLACEHOLDER = "Ask for a change, or # a part…";

export type PromptHistoryMessage = {
  id?: string;
  role?: string;
  parts?: readonly unknown[];
};

export type PromptHistoryEntry = {
  id: string;
  prompt: string;
};

export type PromptHistoryPosition = {
  entryId: string;
  recalled: string;
};

export type PromptHistoryStep = {
  position: PromptHistoryPosition | null;
  prompt: string;
};

function textPartText(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const row = part as { type?: string; text?: unknown };
  if (row.type !== "text" || typeof row.text !== "string") return null;
  return row.text;
}

/** User bubble text without the `[viewer]` stamp the send path prepends. */
export function userPromptText(message: PromptHistoryMessage): string {
  return (message.parts ?? [])
    .flatMap((part) => {
      const text = textPartText(part);
      return text == null ? [] : [text];
    })
    .join("\n")
    .split("\n")
    .filter((line) => !line.startsWith("[viewer]"))
    .join("\n")
    .trim();
}

export function lastUserPromptText(messages: readonly PromptHistoryMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const prompt = userPromptText(message);
    if (prompt) return prompt;
  }
  return null;
}

export function buildPromptHistoryEntries(messages: readonly PromptHistoryMessage[]): PromptHistoryEntry[] {
  const entries: PromptHistoryEntry[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    const prompt = userPromptText(message);
    if (!prompt) continue;
    const id = typeof message.id === "string" && message.id ? message.id : `user-${entries.length}`;
    const previous = entries[entries.length - 1];
    if (previous && previous.prompt === prompt) {
      entries[entries.length - 1] = { id, prompt };
      continue;
    }
    entries.push({ id, prompt });
  }
  return entries;
}

function findActive(entries: readonly PromptHistoryEntry[], position: PromptHistoryPosition): number {
  const byId = entries.findIndex((entry) => entry.id === position.entryId);
  if (byId >= 0) return byId;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.prompt === position.recalled) return i;
  }
  return -1;
}

/**
 * ArrowUp from an empty composer walks older user prompts. ArrowDown walks
 * newer and restores the empty draft past the newest. Returns null when the
 * key should move the caret instead.
 */
export function stepPromptHistory(input: {
  direction: "backward" | "forward";
  entries: readonly PromptHistoryEntry[];
  position: PromptHistoryPosition | null;
  currentPrompt: string;
}): PromptHistoryStep | null {
  const current = input.currentPrompt.trim();
  const activeIndex =
    input.position && input.position.recalled === current ? findActive(input.entries, input.position) : -1;

  if (input.direction === "backward") {
    if (activeIndex < 0 && current.length > 0) return null;
    const entry = input.entries[activeIndex < 0 ? input.entries.length - 1 : activeIndex - 1];
    if (!entry) return null;
    return { position: { entryId: entry.id, recalled: entry.prompt }, prompt: entry.prompt };
  }

  if (activeIndex < 0) return null;
  const entry = input.entries[activeIndex + 1];
  if (!entry) return { position: null, prompt: "" };
  return { position: { entryId: entry.id, recalled: entry.prompt }, prompt: entry.prompt };
}

export function readComposerDraft(map: Map<string, string>, threadId: string): string {
  return map.get(threadId) ?? "";
}

export function writeComposerDraft(map: Map<string, string>, threadId: string, text: string): void {
  if (!text) map.delete(threadId);
  else map.set(threadId, text);
}

/**
 * Persist the outgoing thread's editor text, then return the incoming draft.
 * `outgoingText === null` means the editor was already gone — do not wipe.
 */
export function saveOutgoingThenRestore(
  map: Map<string, string>,
  outgoingId: string,
  incomingId: string,
  outgoingText: string | null,
): string {
  if (outgoingText != null) writeComposerDraft(map, outgoingId, outgoingText);
  return readComposerDraft(map, incomingId);
}

/** In-memory drafts for this tab. Not persisted. */
const sessionDrafts = new Map<string, string>();

export function getSessionDraft(threadId: string): string {
  return readComposerDraft(sessionDrafts, threadId);
}

export function setSessionDraft(threadId: string, text: string): void {
  writeComposerDraft(sessionDrafts, threadId, text);
}

/** Save while the editor is still mounted. No-op when text could not be read. */
export function captureSessionDraft(threadId: string, text: string | null): void {
  if (text == null) return;
  setSessionDraft(threadId, text);
}

function errorMessage(error: { message?: string } | string | null | undefined): string {
  if (error == null) return "";
  return typeof error === "string" ? error : (error.message ?? "");
}

export function isWorkspaceBusyError(error: { message?: string } | string | null | undefined): boolean {
  return /a reply is already in progress/i.test(errorMessage(error));
}

export function mapChatErrorMessage(error: { message?: string } | string | null | undefined): string | null {
  if (error == null) return null;
  if (isWorkspaceBusyError(error)) return WORKSPACE_BUSY_MESSAGE;
  return errorMessage(error) || null;
}

export function providerSendBlockReason(input: {
  ready: boolean;
  label: string;
  status?: string;
  detail?: string;
}): string | null {
  if (!input.ready || !input.status || input.status === "ready") return null;
  return providerLoginSendReason({ label: input.label, status: input.status, detail: input.detail });
}

export function sendDisabledReason(input: {
  loadingModel?: boolean;
  lockSend?: boolean;
  askPlaceholder?: string;
  providerReason?: string | null;
  emptyPrompt?: boolean;
}): string | null {
  if (input.loadingModel) return LOADING_MODEL_PLACEHOLDER;
  if (input.lockSend) return input.askPlaceholder || "Pick an option to continue…";
  if (input.providerReason) return input.providerReason;
  if (input.emptyPrompt) return EMPTY_PROMPT_REASON;
  return null;
}

export function composerPlaceholder(input: {
  askUser?: string | null;
  loadingModel?: boolean;
  modelLoaded?: boolean;
}): string {
  if (input.askUser) return input.askUser;
  if (input.loadingModel) return LOADING_MODEL_PLACEHOLDER;
  if (input.modelLoaded) return MENTION_PLACEHOLDER;
  return DEFAULT_PLACEHOLDER;
}

export function mentionLabelsForPrompt(
  text: string,
  parts: readonly { name: string; cadRef?: string | null }[],
  fileStem?: string,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const hit of parseCadRefs(text)) {
    const resolved = resolveCadRef(hit.ref, parts, fileStem);
    if (resolved) labels[hit.ref] = resolved.label;
  }
  return labels;
}

function mentionNode(ref: string, mentionType: string, labels?: Record<string, string>): JSONContent {
  return {
    type: mentionType,
    attrs: { id: ref, label: labels?.[ref] ?? ref },
  };
}

function inlineFromLine(line: string, mentionType: string, labels?: Record<string, string>): JSONContent[] {
  const hits = parseCadRefs(line);
  if (hits.length === 0) return [{ type: "text", text: line }];
  const content: JSONContent[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) content.push({ type: "text", text: line.slice(cursor, hit.start) });
    content.push(mentionNode(hit.ref, mentionType, labels));
    cursor = hit.end;
  }
  if (cursor < line.length) content.push({ type: "text", text: line.slice(cursor) });
  return content;
}

/** TipTap doc for restore/recall. Mention chips when `mentionType` is set; else plain text. */
export function composerDocFromPrompt(
  text: string,
  mentionType?: string,
  labels?: Record<string, string>,
): JSONContent {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      ...(line
        ? { content: mentionType ? inlineFromLine(line, mentionType, labels) : [{ type: "text", text: line }] }
        : {}),
    })),
  };
}
