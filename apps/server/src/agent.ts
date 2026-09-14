import { HarnessAgent } from "@ai-sdk/harness/agent";
import { createCodex } from "@ai-sdk/harness-codex";
import { createCursor } from "@ai-sdk/harness-cursor";
import { createGrokBuild } from "@ai-sdk/harness-grok-build";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import { z } from "zod";

import {
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS_MODEL,
  type ChatEffort,
  type HarnessId,
} from "@sfab-bench/contract";
import { createLocalSandbox } from "./local-sandbox";
import { projectPath } from "./projects";
import { viewerTools } from "./viewer-context";

const callOptions = z.object({ model: z.string().min(1) });

const identity = "You are an agent running inside this CAD workbench. The open folder is your cwd. Visualization is a STEP or GLB in that folder.";

type ReasoningLevel = Exclude<ChatEffort, "default">;

function reasoning(effort: ChatEffort): ReasoningLevel | undefined {
  return effort === "default" ? undefined : effort;
}

function makeAgent(id: HarnessId, effort: ChatEffort, root: string) {
  const shared = {
    sandbox: createLocalSandbox(root),
    tools: viewerTools,
    instructions: identity,
    permissionMode: "allow-all" as const,
    callOptionsSchema: callOptions,
    prepareCall: ({ options, ...rest }: { options: { model: string } }) => ({
      ...rest,
      model: options.model,
    }),
  };
  const level = reasoning(effort);

  if (id === "codex") {
    return new HarnessAgent({
      id: `sfab-codex-${effort}`,
      harness: createCodex({
        auth: "auto",
        ...(level ? { reasoningEffort: level } : {}),
      }),
      model: DEFAULT_HARNESS_MODEL.codex,
      ...shared,
    });
  }
  if (id === "cursor") {
    return new HarnessAgent({
      id: "sfab-cursor",
      harness: createCursor({ auth: "auto" }),
      model: DEFAULT_HARNESS_MODEL.cursor,
      ...shared,
    });
  }
  if (id === "grok-build") {
    return new HarnessAgent({
      id: `sfab-grok-build-${effort}`,
      harness: createGrokBuild({
        auth: "auto",
        ...(level ? { reasoningEffort: level } : {}),
      }),
      model: DEFAULT_HARNESS_MODEL["grok-build"],
      ...shared,
    });
  }
  return new HarnessAgent({
    id: `sfab-opencode-${effort}`,
    harness: createOpenCode({
      auth: "auto",
      provider: "zai-coding-plan",
      ...(level ? { reasoningVariant: level } : {}),
    }),
    model: process.env.OPENCODE_MODEL ?? DEFAULT_HARNESS_MODEL.opencode,
    ...shared,
  });
}

type AnyAgent = ReturnType<typeof makeAgent>;

const agents = new Map<string, AnyAgent>();

function agentKey(id: HarnessId, effort: ChatEffort, root: string) {
  return id === "cursor" ? `${root}:${id}` : `${root}:${id}:${effort}`;
}

export function resetAgents() {
  agents.clear();
}

export function getAgent(id: HarnessId, effort: ChatEffort = DEFAULT_CHAT_EFFORT) {
  const root = projectPath();
  const key = agentKey(id, effort, root);
  let agent = agents.get(key);
  if (!agent) {
    agent = makeAgent(id, effort, root);
    agents.set(key, agent);
  }
  return agent;
}
