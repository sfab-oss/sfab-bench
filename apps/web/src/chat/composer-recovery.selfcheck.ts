import {
  buildPromptHistoryEntries,
  composerDocFromPrompt,
  composerPlaceholder,
  DEFAULT_PLACEHOLDER,
  EMPTY_PROMPT_REASON,
  lastUserPromptText,
  LOADING_MODEL_PLACEHOLDER,
  mapChatErrorMessage,
  MENTION_PLACEHOLDER,
  type PromptHistoryPosition,
  providerSendBlockReason,
  readComposerDraft,
  sendDisabledReason,
  stepPromptHistory,
  userPromptText,
  WORKSPACE_BUSY_MESSAGE,
  writeComposerDraft,
} from "./composer-recovery";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const user = (id: string, text: string) => ({
  id,
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
});
const assistant = { id: "a", role: "assistant" as const, parts: [{ type: "text" as const, text: "ok" }] };

const stamped = user("u1", "[viewer] file=bracket.step\nHow tall is #o1.2.1?");
expect(userPromptText(stamped) === "How tall is #o1.2.1?", "strip viewer stamp");
expect(lastUserPromptText([stamped, assistant]) === "How tall is #o1.2.1?", "last user prompt");
expect(lastUserPromptText([assistant]) === null, "no user");

const entries = buildPromptHistoryEntries([
  user("u1", "first"),
  assistant,
  user("u2", "second"),
  user("u3", "second"),
  user("u4", ""),
]);
expect(entries.length === 2, "skip empty and collapse consecutive dups");
expect(entries[0]?.id === "u1" && entries[1]?.id === "u3", "dup keeps newest id");

let pos: PromptHistoryPosition | null = null;
const up1 = stepPromptHistory({ direction: "backward", entries, position: pos, currentPrompt: "" });
expect(up1?.prompt === "second", "first ArrowUp is newest");
pos = up1?.position ?? null;
const up2 = stepPromptHistory({
  direction: "backward",
  entries,
  position: pos,
  currentPrompt: up1?.prompt ?? "",
});
expect(up2?.prompt === "first", "second ArrowUp is older");
pos = up2?.position ?? null;
const down1 = stepPromptHistory({
  direction: "forward",
  entries,
  position: pos,
  currentPrompt: "first",
});
expect(down1?.prompt === "second", "ArrowDown walks newer");
const down2 = stepPromptHistory({
  direction: "forward",
  entries,
  position: down1?.position ?? null,
  currentPrompt: "second",
});
expect(down2?.position === null && down2?.prompt === "", "ArrowDown past newest restores empty draft");
expect(
  stepPromptHistory({ direction: "backward", entries, position: null, currentPrompt: "typed" }) === null,
  "ArrowUp with a non-empty draft moves the caret",
);
expect(
  stepPromptHistory({ direction: "backward", entries: [], position: null, currentPrompt: "" }) === null,
  "empty history is a no-op",
);

const drafts = new Map<string, string>();
writeComposerDraft(drafts, "t1", "draft one");
writeComposerDraft(drafts, "t2", "draft two");
expect(readComposerDraft(drafts, "t1") === "draft one", "draft per thread");
expect(readComposerDraft(drafts, "t3") === "", "missing draft is empty");
writeComposerDraft(drafts, "t1", "");
expect(readComposerDraft(drafts, "t1") === "", "empty write drops the key");
expect(drafts.has("t2"), "other thread kept");

expect(mapChatErrorMessage("QA blocked send") === "QA blocked send", "generic error stays");
expect(mapChatErrorMessage("a reply is already in progress") === WORKSPACE_BUSY_MESSAGE, "server 409 body");
expect(mapChatErrorMessage({ message: "409 a reply is already in progress" }) === WORKSPACE_BUSY_MESSAGE, "wrapped 409");
expect(mapChatErrorMessage({ statusCode: 409, message: "Conflict" }) === WORKSPACE_BUSY_MESSAGE, "statusCode 409");
expect(mapChatErrorMessage({ status: 409 }) === WORKSPACE_BUSY_MESSAGE, "status 409");
expect(mapChatErrorMessage(null) === null, "null error");

expect(
  providerSendBlockReason({ ready: true, label: "Codex", status: "needs-auth", detail: "Run `codex login`." }) ===
    "Codex is not ready. Run `codex login`.",
  "reuse provider status sentence",
);
expect(providerSendBlockReason({ ready: true, label: "Codex", status: "ready" }) === null, "ready is not a block");
expect(providerSendBlockReason({ ready: false, label: "Codex", status: "needs-auth" }) === null, "catalog not loaded yet");

expect(sendDisabledReason({ emptyPrompt: true }) === EMPTY_PROMPT_REASON, "empty prompt");
expect(
  sendDisabledReason({ loadingModel: true, emptyPrompt: true, providerReason: "x" }) === LOADING_MODEL_PLACEHOLDER,
  "loading wins",
);
expect(
  sendDisabledReason({ lockSend: true, askPlaceholder: "Pick an option to continue…", emptyPrompt: true }) ===
    "Pick an option to continue…",
  "ask-user lock",
);
expect(
  sendDisabledReason({ providerReason: "Codex is not ready. Run `codex login`.", emptyPrompt: true }) ===
    "Codex is not ready. Run `codex login`.",
  "provider before empty",
);
expect(sendDisabledReason({}) === null, "can send");

expect(composerPlaceholder({}) === DEFAULT_PLACEHOLDER, "default placeholder");
expect(composerPlaceholder({ modelLoaded: true }) === MENTION_PLACEHOLDER, "mention hint when a model is loaded");
expect(composerPlaceholder({ loadingModel: true, modelLoaded: true }) === LOADING_MODEL_PLACEHOLDER, "loading copy");
expect(
  composerPlaceholder({ askUser: "Pick an option to continue…", loadingModel: true }) === "Pick an option to continue…",
  "ask-user placeholder wins",
);

const doc = composerDocFromPrompt("Look at #o1.2.1 please", "part-mention", { "#o1.2.1": "post_left" });
const inline = (doc.content?.[0] as { content?: { type?: string; attrs?: { id?: string; label?: string } }[] }).content;
expect(inline?.[1]?.type === "part-mention", "restore as mention chip");
expect(inline?.[1]?.attrs?.id === "#o1.2.1", "chip id is the ref");
expect(inline?.[1]?.attrs?.label === "post_left", "chip label when provided");
const plain = composerDocFromPrompt("Look at #o1.2.1");
const plainInline = (plain.content?.[0] as { content?: { type?: string; text?: string }[] }).content;
expect(plainInline?.[0]?.type === "text", "plain restore is text");
expect(Boolean(plainInline?.[0]?.text?.includes("#o1.2.1")), "plain restore without mention type");

console.log("composer-recovery.selfcheck ok");
