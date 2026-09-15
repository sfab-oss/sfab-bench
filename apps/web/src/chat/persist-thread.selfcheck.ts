import { shouldPersistMessages } from "./persist-thread";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const user = { id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "PING" }] };
const empty = { id: "a", role: "assistant" as const, parts: [] };
const text = { id: "a", role: "assistant" as const, parts: [{ type: "text" as const, text: "PING" }] };

expect(shouldPersistMessages([user]), "user-only persist");
expect(!shouldPersistMessages([user, empty]), "empty assistant skipped");
expect(shouldPersistMessages([user, text]), "text assistant persisted");

console.log("persist-thread.selfcheck ok");
