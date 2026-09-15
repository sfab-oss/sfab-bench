import {
  type DynamicToolUIPart,
  isTextUIPart,
  isToolUIPart,
  type ToolUIPart,
  type UIMessagePart,
  type UITools,
} from "ai";
import { CheckIcon, CircleIcon, CopyIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";
import {
  isAskUserQuestionsPart,
  parseAskUserQuestionsInput,
} from "@/chat/ask-user-questions";
import { resolveCadRef, cadRefFromHref, linkifyCadRefsInMarkdown } from "@/chat/cad-refs";
import { turnErrorText } from "@/chat/persist-thread";
import { AskUserAnsweredCard } from "@/components/chat/AskUserQuestionsPanel";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ui/tool";
import {
  splitWorkedParts,
  Worked,
  WorkedContent,
  WorkedTrigger,
} from "@/components/ui/worked";
import { partLabelFileStem } from "@/lib/part-label";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { AIDataPart } from "./ai-types";
import type { GalleryChatMessage } from "./mock-chat-messages";

function CadRefChip({ token }: { token: string }) {
  const label = useStore((s) => {
    const parts = s.review?.parts ?? [];
    return resolveCadRef(token, parts, partLabelFileStem(parts.length, s.title))?.label ?? null;
  });
  const selectByRef = useStore((s) => s.selectByRef);

  if (!label) {
    return (
      <span
        className="mx-0.5 inline-flex align-middle rounded-sm bg-muted px-1 py-0.5 text-sm text-muted-foreground"
        title="Not in the open model"
      >
        {token}
      </span>
    );
  }

  return (
    <button
      className="mx-0.5 inline-flex align-middle rounded-sm bg-primary/15 px-1 py-0.5 text-sm font-medium text-primary hover:bg-primary/25"
      onClick={() => selectByRef(token)}
      title={token}
      type="button"
    >
      {label}
    </button>
  );
}

type MarkdownAnchorProps = ComponentProps<"a"> & { node?: unknown };

/**
 * Streamdown's default `MarkdownA` is not exported. This matches its
 * linkSafety-off `<a>` fallback (`rel="noreferrer" target="_blank"` plus
 * the `wrap-anywhere font-medium text-primary underline` classes). The
 * default-on linkSafety path (button + confirmation modal) cannot be reused.
 */
function StreamdownMarkdownA({
  href,
  className,
  children,
  node: _node,
  ...props
}: MarkdownAnchorProps) {
  return (
    <a
      {...props}
      className={cn("wrap-anywhere font-medium text-primary underline", className)}
      data-streamdown="link"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function CadRefAnchor(props: MarkdownAnchorProps) {
  const token = cadRefFromHref(props.href);
  if (token) {
    return <CadRefChip token={token} />;
  }
  return <StreamdownMarkdownA {...props} />;
}

function MarkdownBody({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const markdown = linkifyCadRefsInMarkdown(children);
  return (
    <Streamdown
      className={cn(
        "size-full text-base [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={{ a: CadRefAnchor }}
    >
      {markdown}
    </Streamdown>
  );
}

function PlanPart({
  entries,
  messageId,
  partIndex,
}: {
  entries: AIDataPart["plan"]["entries"];
  messageId: string;
  partIndex: number;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className="my-2 flex flex-col gap-1"
      key={`${messageId}-plan-${partIndex}`}
    >
      {entries.map((entry, index) => {
        const done = entry.status === "completed";
        return (
          <Marker
            // biome-ignore lint/suspicious/noArrayIndexKey: plan entries have no stable id
            key={`${messageId}-plan-${partIndex}-${index}`}
          >
            <MarkerIcon>{done ? <CheckIcon /> : <CircleIcon />}</MarkerIcon>
            <MarkerContent className={cn(done && "line-through")}>
              {entry.content}
            </MarkerContent>
          </Marker>
        );
      })}
    </div>
  );
}

function DefaultToolPart({
  part,
  messageId,
  partIndex,
}: {
  part: DynamicToolUIPart | ToolUIPart;
  messageId: string;
  partIndex: number;
}) {
  const toolName =
    "toolName" in part && typeof part.toolName === "string"
      ? part.toolName
      : part.type.slice(5);

  return (
    <Tool defaultOpen={false} key={`${messageId}-tool-${partIndex}`}>
      <ToolHeader
        input={part.input}
        state={part.state}
        title={toolName}
        type={`tool-${toolName}` as ToolUIPart["type"]}
      />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
}

function AskUserQuestionsPart({
  part,
}: {
  part: DynamicToolUIPart | ToolUIPart;
}) {
  const input = parseAskUserQuestionsInput(part.input);
  if (!input) {
    return <DefaultToolPart messageId="" part={part} partIndex={0} />;
  }
  const pending = part.state === "input-available" || part.state === "input-streaming";
  if (pending) return null;
  return <AskUserAnsweredCard input={input} output={part.output} />;
}

function GalleryMessagePart({
  part,
  messageId,
  partIndex,
  isLastPart,
  isStreaming,
  role,
}: {
  part: UIMessagePart<AIDataPart, UITools>;
  messageId: string;
  partIndex: number;
  isLastPart: boolean;
  isStreaming: boolean;
  role: GalleryChatMessage["role"];
}) {
  if (part.type === "text") {
    if (role === "user") {
      return (
        <Bubble align="end" variant="secondary">
          <BubbleContent>
            <MarkdownBody>{part.text}</MarkdownBody>
          </BubbleContent>
        </Bubble>
      );
    }

    return (
      <Bubble variant="ghost">
        <BubbleContent className="w-full max-w-full">
          <MarkdownBody>{part.text}</MarkdownBody>
        </BubbleContent>
      </Bubble>
    );
  }

  const errorText = turnErrorText(part);
  if (errorText) {
    return (
      <p className="my-2 whitespace-pre-wrap break-words text-sm text-destructive">{errorText}</p>
    );
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning
        className="my-2"
        isStreaming={isStreaming && isLastPart}
        key={`${messageId}-reasoning-${partIndex}`}
      >
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "dynamic-tool" || isToolUIPart(part)) {
    const toolPart = part as DynamicToolUIPart | ToolUIPart;
    if (isAskUserQuestionsPart(toolPart)) {
      return (
        <AskUserQuestionsPart
          key={`${messageId}-ask-${partIndex}`}
          part={toolPart}
        />
      );
    }
    return (
      <DefaultToolPart
        key={`${messageId}-tool-${partIndex}`}
        messageId={messageId}
        part={toolPart}
        partIndex={partIndex}
      />
    );
  }

  if (part.type === "data-plan") {
    return (
      <PlanPart
        entries={part.data.entries}
        key={`${messageId}-plan-${partIndex}`}
        messageId={messageId}
        partIndex={partIndex}
      />
    );
  }

  return null;
}

function workedDurationSeconds(
  message: GalleryChatMessage
): number | undefined {
  const responseTime = message.metadata?.responseTime;
  if (typeof responseTime !== "number" || responseTime <= 0) {
    return;
  }
  return Math.max(1, Math.round(responseTime / 1000));
}

export function ChatMessageRow({
  message,
  isStreaming = false,
}: {
  message: GalleryChatMessage;
  isStreaming?: boolean;
}) {
  const textForCopy = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n");
  const align = message.role === "user" ? "end" : "start";
  const lastPartIndex = message.parts.length - 1;
  const duration = workedDurationSeconds(message);

  const partRow = (
    part: GalleryChatMessage["parts"][number],
    partIndex: number
  ) => (
    <GalleryMessagePart
      isLastPart={partIndex === lastPartIndex}
      isStreaming={isStreaming}
      key={`${message.id}-part-${partIndex}`}
      messageId={message.id}
      part={part}
      partIndex={partIndex}
      role={message.role}
    />
  );

  return (
    <Message align={align}>
      <MessageContent>
        {message.role === "assistant"
          ? splitWorkedParts(message.parts).map((segment) => {
              if (segment.kind === "worked") {
                const start = segment.items[0]?.index ?? 0;
                return (
                  <Worked
                    duration={duration}
                    isStreaming={isStreaming}
                    key={`${message.id}-worked-${start}`}
                  >
                    <WorkedTrigger />
                    <WorkedContent>
                      {segment.items.map((item) =>
                        partRow(item.part, item.index)
                      )}
                    </WorkedContent>
                  </Worked>
                );
              }
              return partRow(segment.item.part, segment.item.index);
            })
          : message.parts.map((part, partIndex) => partRow(part, partIndex))}
        {message.role === "assistant" && textForCopy ? (
          <MessageFooter>
            <Button
              aria-label="Copy"
              onClick={() => navigator.clipboard.writeText(textForCopy)}
              size="icon-xs"
              title="Copy"
              type="button"
              variant="ghost"
            >
              <CopyIcon className="size-3.5" />
            </Button>
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  );
}
