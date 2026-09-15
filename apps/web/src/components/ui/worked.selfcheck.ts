import { splitWorkedParts } from "./worked";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

function kinds(parts: Array<{ type: string; toolName?: string }>) {
  return splitWorkedParts(parts).map((segment) => {
    if (segment.kind === "worked") return `worked:${segment.items.map((item) => item.part.type).join(",")}`;
    return `visible:${segment.item.part.type}`;
  });
}

const simple = kinds([
  { type: "reasoning" },
  { type: "dynamic-tool" },
  { type: "text" },
]);
expect(simple.length === 2, "simple-ai mock stays one fold plus answer");
expect(simple[0] === "worked:reasoning,dynamic-tool", `simple fold, got ${simple[0]}`);
expect(simple[1] === "visible:text", "answer stays visible");

const harness = kinds([
  { type: "step-start" },
  { type: "reasoning" },
  { type: "tool-bash" },
  { type: "step-start" },
  { type: "reasoning" },
  { type: "tool-read" },
  { type: "step-start" },
  { type: "text" },
]);
expect(harness.length === 2, `harness steps collapse to one fold, got ${harness.length}: ${harness.join(" | ")}`);
expect(harness[0] === "worked:reasoning,tool-bash,reasoning,tool-read", `merged work, got ${harness[0]}`);
expect(harness[1] === "visible:text", "harness answer stays visible");

const trailing = kinds([
  { type: "reasoning" },
  { type: "text" },
  { type: "step-start" },
  { type: "tool-bash" },
]);
expect(trailing.join("|") === "worked:reasoning|visible:text|visible:tool-bash", `trailing tools stay outside, got ${trailing.join("|")}`);

const ask = kinds([
  { type: "reasoning" },
  { type: "tool-bash" },
  { type: "tool-askUserQuestions" },
]);
expect(
  ask.join("|") === "worked:reasoning,tool-bash|visible:tool-askUserQuestions",
  `ask-user stays outside the fold, got ${ask.join("|")}`,
);

const askDynamic = kinds([
  { type: "dynamic-tool", toolName: "askUserQuestions" },
]);
expect(askDynamic[0] === "visible:dynamic-tool", `dynamic ask-user stays visible, got ${askDynamic[0]}`);

console.log("worked.selfcheck ok");
