import { messagesToPersist } from "./chat-persist";
import type { UIMessage } from "ai";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const user: UIMessage = { id: "u", role: "user", parts: [{ type: "text", text: "PING" }] };
const empty: UIMessage = { id: "a", role: "assistant", parts: [] };
const text: UIMessage = { id: "a", role: "assistant", parts: [{ type: "text", text: "PING" }] };

const live = [user];

expect(messagesToPersist(live, undefined).length === 1, "no assistant → live only");
expect(messagesToPersist(live, empty).length === 1, "empty assistant dropped");
expect(messagesToPersist(live, empty)[0] === user, "empty assistant does not replace live");

const withText = messagesToPersist(live, text);
expect(withText.length === 2, "text assistant kept");
expect(withText[1] === text, "text assistant appended");

console.log("chat-persist.selfcheck ok");
