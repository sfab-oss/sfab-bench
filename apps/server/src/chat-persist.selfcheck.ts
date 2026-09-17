import type { UIMessage } from "ai";
import {
  failedAssistant,
  messagesToPersist,
  withTurnError,
} from "./chat-persist";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const user: UIMessage = {
  id: "u",
  role: "user",
  parts: [{ type: "text", text: "PING" }],
};
const empty: UIMessage = { id: "a", role: "assistant", parts: [] };
const text: UIMessage = {
  id: "a",
  role: "assistant",
  parts: [{ type: "text", text: "PING" }],
};

const live = [user];

expect(
  messagesToPersist(live, undefined).length === 1,
  "no assistant → live only"
);
expect(messagesToPersist(live, empty).length === 1, "empty assistant dropped");
expect(
  messagesToPersist(live, empty)[0] === user,
  "empty assistant does not replace live"
);

const withText = messagesToPersist(live, text);
expect(withText.length === 2, "text assistant kept");
expect(withText[1] === text, "text assistant appended");

const failed = failedAssistant("Bootstrap command failed");
expect(failed.role === "assistant", "failed assistant role");
expect(
  (failed.parts ?? []).some((p) => p.type === "data-error"),
  "failed assistant has data-error"
);
const persistedFail = messagesToPersist(live, failed);
expect(persistedFail.length === 2, "failed assistant persisted");
expect(persistedFail[1] === failed, "failed assistant appended");

const fromEmpty = withTurnError(empty, "Bootstrap command failed");
expect((fromEmpty.parts ?? []).length === 1, "empty assistant gets error part");
expect((fromEmpty.parts ?? [])[0]?.type === "data-error", "error part type");

const withBoth = withTurnError(text, "later fail");
expect(
  (withBoth.parts ?? []).length === 2,
  "partial assistant keeps text and error"
);
expect(
  withTurnError(failed, "again") === failed,
  "do not duplicate data-error"
);

console.log("chat-persist.selfcheck ok");
