import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart } from "ai";

export const ASK_USER_QUESTIONS_TOOL = "askUserQuestions";

export type AskUserQuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type AskUserQuestion = {
  id: string;
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
  allowMultiple: boolean;
  allowFreeForm: boolean;
};

export type AskUserQuestionsInput = {
  allowPartialAnswers: boolean;
  questions: AskUserQuestion[];
};

export type AskUserAnswer = {
  optionIds: string[];
  freeform?: string;
};

export type AskUserQuestionsOutput =
  | {
      action: "answered";
      answers: Record<string, AskUserAnswer>;
    }
  | { action: "declined" };

export function isAskUserQuestionsPart(part: { type: string; toolName?: string }): boolean {
  if (part.type === "dynamic-tool" || isToolUIPart(part as ToolUIPart)) {
    return getToolName(part as ToolUIPart | DynamicToolUIPart) === ASK_USER_QUESTIONS_TOOL;
  }
  return part.toolName === ASK_USER_QUESTIONS_TOOL;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  let next: unknown = value;
  if (typeof next === "string") {
    try {
      next = JSON.parse(next);
    } catch {
      return null;
    }
  }
  if (!next || typeof next !== "object" || Array.isArray(next)) return null;
  return next as Record<string, unknown>;
}

function parseAllowFreeForm(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return true;
  return false;
}

function parseOption(raw: unknown, index: number): AskUserQuestionOption | null {
  const row = asRecord(raw);
  if (!row) return null;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!label) return null;
  const id = typeof row.id === "string" && row.id.trim() ? row.id : `option-${index + 1}`;
  const description = typeof row.description === "string" ? row.description : undefined;
  return { id, label, description };
}

function parseQuestion(raw: unknown, index: number): AskUserQuestion | null {
  const row = asRecord(raw);
  if (!row) return null;
  const question = typeof row.question === "string" ? row.question.trim() : "";
  if (!question) return null;
  const allowFreeForm = parseAllowFreeForm(row.allowFreeForm);
  const options = Array.isArray(row.options)
    ? row.options.map(parseOption).filter((option): option is AskUserQuestionOption => option !== null)
    : [];
  if (options.length === 0 && !allowFreeForm) return null;
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : `question-${index + 1}`,
    question,
    header: typeof row.header === "string" && row.header.trim() ? row.header : undefined,
    options,
    allowMultiple: row.allowMultiple === true,
    allowFreeForm,
  };
}

export function parseAskUserQuestionsInput(input: unknown): AskUserQuestionsInput | null {
  const raw = asRecord(input);
  if (!raw || !Array.isArray(raw.questions)) return null;
  const questions = raw.questions
    .map(parseQuestion)
    .filter((question): question is AskUserQuestion => question !== null);
  if (questions.length === 0) return null;
  return {
    allowPartialAnswers: raw.allowPartialAnswers === true,
    questions,
  };
}

export function buildAskUserQuestionsOutput(
  answers: Record<string, AskUserAnswer>,
): Extract<AskUserQuestionsOutput, { action: "answered" }> {
  return { action: "answered", answers };
}

export function formatAskUserAnswer(input: AskUserQuestionsInput, output: unknown): string {
  const row = asRecord(output);
  if (!row) return "";
  if (row.action === "declined" || row.action === "cancelled") return "Skipped";
  const answers = asRecord(row.answers);
  if (!answers) return "";
  return input.questions
    .map((question) => {
      const picked = asRecord(answers[question.id]);
      const freeform = typeof picked?.freeform === "string" ? picked.freeform.trim() : "";
      if (freeform) return freeform;
      const ids = Array.isArray(picked?.optionIds)
        ? picked.optionIds.filter((id): id is string => typeof id === "string")
        : [];
      const labels = ids.map((id) => question.options.find((option) => option.id === id)?.label ?? id);
      return labels.join(", ");
    })
    .filter(Boolean)
    .join(" · ");
}

export function findPendingAskUserQuestions(
  messages: Array<{ role: string; parts?: readonly unknown[] }>,
): { toolCallId: string; input: AskUserQuestionsInput } | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts ?? []) {
    if (!part || typeof part !== "object") continue;
    const row = part as { type: string; toolName?: string; state?: string; toolCallId?: string; input?: unknown };
    if (!isAskUserQuestionsPart(row)) continue;
    if (row.state !== "input-available" && row.state !== "input-streaming") continue;
    if (!row.toolCallId) continue;
    const input = parseAskUserQuestionsInput(row.input);
    if (!input) continue;
    return { toolCallId: row.toolCallId, input };
  }
  return null;
}

export function askUserComposerPlaceholder(question: AskUserQuestion | undefined): string {
  if (!question) return "Ask for a change…";
  if (question.allowFreeForm && question.options.length > 0) return "Type an answer or pick an option…";
  if (question.allowFreeForm) return "Type an answer…";
  return "Pick an option to continue…";
}
