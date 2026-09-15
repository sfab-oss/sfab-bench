import { dropTrailingHarnessErrors, isCompletedTurnFinish } from "./chat-stream";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const part of stream) out.push(part);
  return out;
}

expect(isCompletedTurnFinish("stop"), "stop is a completed turn");
expect(isCompletedTurnFinish("length"), "length is a completed turn");
expect(isCompletedTurnFinish({ unified: "stop" }), "unified stop");
expect(!isCompletedTurnFinish("tool-calls"), "tool-calls is not done");
expect(!isCompletedTurnFinish("error"), "error finish is not a success");

const dropped = await collect(
  dropTrailingHarnessErrors(
    ReadableStream.from([
      { type: "text-delta", id: "a" },
      { type: "finish-step", finishReason: "tool-calls" },
      { type: "text-delta", id: "b" },
      { type: "finish-step", finishReason: "stop" },
      { type: "error", error: new Error("trailing") },
      { type: "finish", finishReason: "stop" },
    ]),
  ),
);
expect(
  dropped.map((p) => p.type).join(",") === "text-delta,finish-step,text-delta,finish-step,finish",
  `trailing error dropped, got ${dropped.map((p) => p.type).join(",")}`,
);

const kept = await collect(
  dropTrailingHarnessErrors(
    ReadableStream.from([
      { type: "text-delta", id: "a" },
      { type: "finish-step", finishReason: "tool-calls" },
      { type: "error", error: new Error("mid-turn") },
    ]),
  ),
);
expect(kept.at(-1)?.type === "error", "error after tool-calls is kept");

console.log("chat-stream.selfcheck ok");
