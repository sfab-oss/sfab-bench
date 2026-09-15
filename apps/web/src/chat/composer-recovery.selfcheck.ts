import {
  lastUserPromptText,
  mapChatErrorMessage,
  providerSendBlockReason,
  stripViewerStamp,
  userPromptText,
  WORKSPACE_BUSY_MESSAGE,
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
expect(stripViewerStamp("[viewer] file=bracket.step\nHow tall is #o1.2.1?") === "How tall is #o1.2.1?", "strip viewer stamp");
expect(userPromptText(stamped) === "How tall is #o1.2.1?", "user prompt strips stamp");
expect(lastUserPromptText([stamped, assistant]) === "How tall is #o1.2.1?", "last user prompt");
expect(lastUserPromptText([assistant]) === null, "no user");

expect(mapChatErrorMessage("QA blocked send") === "QA blocked send", "generic error stays");
expect(mapChatErrorMessage("a reply is already in progress") === WORKSPACE_BUSY_MESSAGE, "server 409 body");
expect(
  mapChatErrorMessage(new Error("a reply is already in progress")) === WORKSPACE_BUSY_MESSAGE,
  "SDK Error(body) 409",
);
expect(
  mapChatErrorMessage(new Error("Failed to fetch the chat response.")) === "Failed to fetch the chat response.",
  "Failed to fetch is not a 409",
);
expect(mapChatErrorMessage(null) === null, "null error");

expect(
  providerSendBlockReason({ ready: true, label: "Codex", status: "needs-auth", detail: "Run `codex login`." }) ===
    "Codex isn't signed in — run `codex login`",
  "reuse provider status sentence",
);
expect(providerSendBlockReason({ ready: true, label: "Codex", status: "ready" }) === null, "ready is not a block");
expect(providerSendBlockReason({ ready: false, label: "Codex", status: "needs-auth" }) === null, "catalog not loaded yet");

console.log("composer-recovery.selfcheck ok");
