import { providerLoginSendReason } from "@/chat/model-picker";

/** Workspace mutex (ADR 0003). Server body is "a reply is already in progress". */
export const WORKSPACE_BUSY_MESSAGE =
  "a reply is already in progress in this folder";

export const LOADING_MODEL_PLACEHOLDER = "Loading the model into this tab…";
export const EMPTY_PROMPT_REASON = "Enter a message to send";
export const COMPOSER_HINT = "Enter to send · Shift+Enter for a new line";
export const DEFAULT_PLACEHOLDER = "Ask for a change…";
export const MENTION_PLACEHOLDER = "Ask for a change, or # a part…";

export type ChatTextMessage = {
  id?: string;
  role?: string;
  parts?: readonly unknown[];
};

function textPartText(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const row = part as { type?: string; text?: unknown };
  if (row.type !== "text" || typeof row.text !== "string") return null;
  return row.text;
}

export function stripViewerStamp(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("[viewer]"))
    .join("\n")
    .trim();
}

/** User bubble text without the `[viewer]` stamp the send path prepends. */
export function userPromptText(message: ChatTextMessage): string {
  return stripViewerStamp(
    (message.parts ?? [])
      .flatMap((part) => {
        const text = textPartText(part);
        return text == null ? [] : [text];
      })
      .join("\n")
  );
}

export function lastUserPromptText(
  messages: readonly ChatTextMessage[]
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const prompt = userPromptText(message);
    if (prompt) return prompt;
  }
  return null;
}

/** In-memory drafts for this tab. Not persisted. */
const sessionDrafts = new Map<string, string>();

export function getSessionDraft(threadId: string): string {
  return sessionDrafts.get(threadId) ?? "";
}

export function setSessionDraft(threadId: string, text: string): void {
  if (!text) sessionDrafts.delete(threadId);
  else sessionDrafts.set(threadId, text);
}

/** Save while the editor is still mounted. No-op when text could not be read. */
export function captureSessionDraft(
  threadId: string,
  text: string | null
): void {
  if (text == null) return;
  setSessionDraft(threadId, text);
}

function errorMessage(
  error: { message?: string } | string | null | undefined
): string {
  if (error == null) return "";
  return typeof error === "string" ? error : (error.message ?? "");
}

export function isWorkspaceBusyError(
  error: { message?: string } | string | null | undefined
): boolean {
  return /a reply is already in progress/i.test(errorMessage(error));
}

export const NO_UNFINISHED_TURN_MESSAGE = "That reply already finished.";

export function isNoUnfinishedTurnError(
  error: { message?: string } | string | null | undefined
): boolean {
  return /no unfinished turn/i.test(errorMessage(error));
}

export function mapChatErrorMessage(
  error: { message?: string } | string | null | undefined
): string | null {
  if (error == null) return null;
  if (isWorkspaceBusyError(error)) return WORKSPACE_BUSY_MESSAGE;
  if (isNoUnfinishedTurnError(error)) return NO_UNFINISHED_TURN_MESSAGE;
  return errorMessage(error) || null;
}

export function providerSendBlockReason(input: {
  ready: boolean;
  label: string;
  status?: string;
  detail?: string;
}): string | null {
  if (!input.ready || !input.status || input.status === "ready") return null;
  return providerLoginSendReason({
    label: input.label,
    status: input.status,
    detail: input.detail,
  });
}

export function sendDisabledReason(input: {
  loadingModel?: boolean;
  lockSend?: boolean;
  askPlaceholder?: string;
  providerReason?: string | null;
  emptyPrompt?: boolean;
}): string | null {
  if (input.loadingModel) return LOADING_MODEL_PLACEHOLDER;
  if (input.lockSend)
    return input.askPlaceholder || "Pick an option to continue…";
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

export function firstSetupCopy(label: string): string {
  return `First-time setup for ${label}. Takes a minute, then we skip this.`;
}

/** Catalog unknown is not a first-time install. Latch covers a stale false after the stream starts. */
export function showFirstSetupHint(input: {
  status: string;
  bridgeReady: boolean | undefined;
  latched: boolean;
}): boolean {
  return (
    input.status === "submitted" &&
    input.bridgeReady === false &&
    !input.latched
  );
}

/** Copy and latch follow the send's provider, not a mid-wait picker change. */
export function inFlightHarness<T extends string>(input: {
  status: string;
  live: T;
  frozen: T | null;
}): { frozen: T | null; harness: T } {
  const inFlight = input.status === "submitted" || input.status === "streaming";
  const frozen = inFlight ? (input.frozen ?? input.live) : null;
  return { frozen, harness: frozen ?? input.live };
}

export function shouldLatchFirstSetup(input: {
  status: string;
  harness: string;
  latched: ReadonlySet<string>;
}): boolean {
  return input.status === "streaming" && !input.latched.has(input.harness);
}
