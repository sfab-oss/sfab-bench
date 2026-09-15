import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import {
  buildAskUserQuestionsOutput,
  formatAskUserAnswer,
  type AskUserAnswer,
  type AskUserQuestion,
  type AskUserQuestionsInput,
  type AskUserQuestionsOutput,
} from "@/chat/ask-user-questions";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { matchesShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export type AskUserQuestionsHandle = {
  submitFreeform: (text: string) => boolean;
  activeQuestion: AskUserQuestion | null;
};

export function AskUserQuestionsPanel({
  input,
  disabled = false,
  onAnswer,
  onActiveChange,
  ref,
}: {
  input: AskUserQuestionsInput;
  disabled?: boolean;
  onAnswer: (output: AskUserQuestionsOutput) => void;
  onActiveChange?: (question: AskUserQuestion | null) => void;
  ref?: Ref<AskUserQuestionsHandle>;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setAnswers] = useState<Record<string, AskUserAnswer>>({});
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const advanceTimer = useRef<number | null>(null);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;

  const question = input.questions[Math.min(index, input.questions.length - 1)] ?? null;
  const selected = question ? (picked[question.id]?.optionIds ?? []) : [];
  const highlighted = optimistic ?? selected[0];

  useEffect(() => {
    onActiveChange?.(question);
  }, [onActiveChange, question]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  const finish = useCallback((next: Record<string, AskUserAnswer>) => {
    onAnswerRef.current(buildAskUserQuestionsOutput(next));
  }, []);

  const advanceOrFinish = useCallback(
    (next: Record<string, AskUserAnswer>) => {
      if (index >= input.questions.length - 1) {
        finish(next);
        return;
      }
      setOptimistic(null);
      setOpen(true);
      setIndex((cur) => cur + 1);
    },
    [finish, index, input.questions.length],
  );

  const selectOption = useCallback(
    (optionId: string) => {
      if (!question || disabled) return;
      if (question.allowMultiple) {
        setAnswers((cur) => {
          const current = cur[question.id]?.optionIds ?? [];
          const nextIds = current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
          return { ...cur, [question.id]: { optionIds: nextIds } };
        });
        return;
      }
      const next = { ...picked, [question.id]: { optionIds: [optionId] } };
      setAnswers(next);
      setOptimistic(optionId);
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null;
        advanceOrFinish(next);
      }, 180);
    },
    [advanceOrFinish, disabled, picked, question],
  );

  useImperativeHandle(
    ref,
    () => ({
      activeQuestion: question,
      submitFreeform: (text: string) => {
        if (!question || disabled || !question.allowFreeForm) return false;
        const trimmed = text.trim();
        if (!trimmed) return false;
        advanceOrFinish({ ...picked, [question.id]: { optionIds: [], freeform: trimmed } });
        return true;
      },
    }),
    [advanceOrFinish, disabled, picked, question],
  );

  useEffect(() => {
    if (!question || disabled || question.allowMultiple || question.options.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, "ask-user-choose", { mac: false, activeElement: document.activeElement })) return;
      const digit = Number.parseInt(event.key, 10);
      const option = question.options[digit - 1];
      if (!option) return;
      event.preventDefault();
      selectOption(optionIdFor(option, digit - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disabled, question, selectOption]);

  // Locked send has no visible reason if this collapses, so keep it open until they pick.
  const keepOpen = Boolean(question && !question.allowFreeForm);

  if (!question) return null;

  return (
    <Collapsible
      open={keepOpen ? true : open}
      onOpenChange={(next) => {
        if (keepOpen) return;
        setOpen(next);
      }}
    >
      <div className="px-3 pt-2">
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          <span className="shrink-0">{question.header ?? "Question"}</span>
          {open ? null : (
            <span className="min-w-0 flex-1 truncate font-normal">{question.question}</span>
          )}
          {input.questions.length > 1 ? (
            <span className="tabular-nums">
              {index + 1}/{input.questions.length}
            </span>
          ) : null}
          <ChevronDownIcon className={cn("ml-auto size-3.5 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mt-1 text-sm text-foreground">{question.question}</p>
          {question.allowMultiple ? (
            <p className="mt-1 text-xs text-muted-foreground">Select one or more options.</p>
          ) : null}
          {question.options.length > 0 ? (
            <div className="mt-2 flex flex-col gap-0.5 pb-2">
              {question.options.map((option, optionIndex) => {
                const optionId = optionIdFor(option, optionIndex);
                const isSelected = question.allowMultiple
                  ? selected.includes(optionId)
                  : highlighted === optionId;
                const shortcut = optionIndex < 9 ? optionIndex + 1 : null;
                return (
                  <button
                    key={optionId}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectOption(optionId)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                      isSelected ? "bg-muted text-foreground" : "text-foreground/85 hover:bg-muted/70",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.description && option.description !== option.label ? (
                        <span className="text-[11px] text-muted-foreground">{option.description}</span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <CheckIcon className="size-3.5 shrink-0 text-foreground" />
                    ) : shortcut !== null ? (
                      <kbd className="flex size-5 shrink-0 items-center justify-center text-[10px] font-medium text-muted-foreground tabular-nums">
                        {shortcut}
                      </kbd>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pb-2" />
          )}
          {question.allowMultiple ? (
            <div className="flex justify-end pb-2">
              <Button
                type="button"
                size="sm"
                disabled={disabled || selected.length === 0}
                onClick={() => {
                  const next = { ...picked, [question.id]: { optionIds: selected } };
                  advanceOrFinish(next);
                }}
              >
                Continue
              </Button>
            </div>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function AskUserAnsweredCard({
  input,
  output,
}: {
  input: AskUserQuestionsInput;
  output: unknown;
}) {
  const summary = formatAskUserAnswer(input, output);
  const header = input.questions[0]?.header ?? "Question";
  return (
    <div className="my-2 w-full rounded-xl border border-border px-3 py-2 text-sm">
      <div className="text-xs font-medium text-muted-foreground">{header}</div>
      <div className="mt-0.5 text-foreground">{summary || "Answered"}</div>
    </div>
  );
}

function optionIdFor(option: { id: string }, index: number) {
  return option.id || `option-${index + 1}`;
}
