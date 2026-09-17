/**
 * The server's accept condition for a tool turn must equal the client's
 * resubmit condition (`sendAutomaticallyWhen` in ChatSession/XrChatRuntime).
 * These rows are the two ways a hand-written copy of it drifted last time and
 * rejected turns the client had already resent.
 */
import type { UIMessage } from "ai";

import { lastIsToolContinuation, priorMessages } from "./chat";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const assistant = (parts: UIMessage["parts"]): UIMessage => ({
  id: "m1",
  role: "assistant",
  parts,
});

expect(
  !lastIsToolContinuation({
    id: "u",
    role: "user",
    parts: [{ type: "text", text: "hi" }],
  }),
  "a user message is not a continuation"
);

expect(
  !lastIsToolContinuation(assistant([{ type: "text", text: "done" }])),
  "an assistant message with no tools is not a continuation"
);

expect(
  lastIsToolContinuation(
    assistant([
      {
        type: "tool-getViewer",
        toolCallId: "a",
        state: "output-available",
        input: {},
        output: {},
      },
    ] as UIMessage["parts"])
  ),
  "a finished host tool is a continuation"
);

expect(
  !lastIsToolContinuation(
    assistant([
      {
        type: "tool-getViewer",
        toolCallId: "a",
        state: "input-available",
        input: {},
      },
    ] as UIMessage["parts"])
  ),
  "an unfinished host tool is not a continuation"
);

// The harness runs provider-executed tools itself and never reports a result,
// so one stuck at input-available must not block the resend. This is the
// OpenCode failure: a provider `bash` beside one of our viewer tools.
expect(
  lastIsToolContinuation(
    assistant([
      {
        type: "tool-bash",
        toolCallId: "b",
        state: "input-available",
        input: {},
        providerExecuted: true,
      },
      {
        type: "tool-getViewer",
        toolCallId: "a",
        state: "output-available",
        input: {},
        output: {},
      },
    ] as UIMessage["parts"])
  ),
  "a provider-executed tool is ignored, so the turn still continues"
);

// Only the last step counts. An earlier step's tools are already answered.
expect(
  lastIsToolContinuation(
    assistant([
      {
        type: "tool-getViewer",
        toolCallId: "old",
        state: "input-available",
        input: {},
      },
      { type: "step-start" },
      {
        type: "tool-getViewer",
        toolCallId: "new",
        state: "output-available",
        input: {},
        output: {},
      },
    ] as UIMessage["parts"])
  ),
  "a stale tool before the last step-start does not block the turn"
);

const stamped: UIMessage = {
  id: "u",
  role: "user",
  parts: [{ type: "text", text: "now" }],
};
const history: UIMessage[] = [
  { id: "h", role: "user", parts: [{ type: "text", text: "earlier" }] },
  stamped,
];
const continued = priorMessages(true, history, stamped);
expect(continued === history, "continueTurn returns body.messages");
const fresh = priorMessages(false, history, stamped);
expect(
  fresh.length === 1 && fresh[0] === stamped,
  "a normal user turn does not replay history"
);

console.log("chat-continuation.selfcheck ok");
