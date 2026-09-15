import {
  type DynamicToolUIPart,
  isToolUIPart,
  type ToolUIPart,
  type UIMessagePart,
  type UITools,
} from "ai";
import { CheckIcon, CircleIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import {
  isAskUserQuestionsPart,
  parseAskUserQuestionsInput,
} from "@/chat/ask-user-questions";
import { resolveCadRef, cadRefFromHref, linkifyCadRefsInMarkdown } from "@/chat/cad-refs";
import { isWorkspaceBusyError, mapChatErrorMessage } from "@/chat/composer-recovery";
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
import { messagePlainText } from "./useViewerChat";

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

const CAD_REF_COMPONENTS = { a: CadRefAnchor };

function MarkdownBody({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const markdown = linkifyCadRefsInMarkdown(children);
  // Only override links when there are chips, so plain messages keep Streamdown's link safety.
  const hasCadRefs = markdown !== children;
  return (
    <Streamdown
      className={cn(
        "size-full min-w-0 max-w-full overflow-x-hidden text-base [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_ul]:my-2 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5 [&_ul_ul]:list-[circle] [&_ol_ul]:list-[circle]",
        "[&_[data-streamdown=code-block]]:relative [&_[data-streamdown=code-block]]:min-w-0 [&_[data-streamdown=code-block]]:max-w-full [&_[data-streamdown=code-block]]:gap-1 [&_[data-streamdown=code-block]]:p-1.5 [&_[data-streamdown=code-block]]:[contain-intrinsic-size:auto_0px] [&_[data-streamdown=code-block]]:[content-visibility:visible]",
        "[&_[data-streamdown=code-block-header]]:h-auto [&_[data-streamdown=code-block-header]]:min-h-0 [&_[data-streamdown=code-block-header]]:py-0.5 [&_[data-streamdown=code-block-header]]:pr-16",
        "[&_[data-streamdown=code-block-header]:has(>span:empty)]:hidden",
        "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:absolute [&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:top-1.5 [&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:right-1.5 [&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:z-10 [&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:mt-0 [&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:h-auto",
        "[&_[data-streamdown=code-block-body]]:min-w-0 [&_[data-streamdown=code-block-body]]:max-w-full",
        "[&_[data-streamdown=code-block-body]_pre]:max-w-full [&_[data-streamdown=code-block-body]_pre]:overflow-x-auto [&_[data-streamdown=code-block-body]_pre]:whitespace-pre-wrap [&_[data-streamdown=code-block-body]_pre]:break-words",
        className,
      )}
      components={hasCadRefs ? CAD_REF_COMPONENTS : undefined}
      data-slot="chat-markdown"
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
  onRetry,
  onStop,
}: {
  part: UIMessagePart<AIDataPart, UITools>;
  messageId: string;
  partIndex: number;
  isLastPart: boolean;
  isStreaming: boolean;
  role: GalleryChatMessage["role"];
  onRetry?: () => void;
  onStop?: () => void;
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
    const mapped = mapChatErrorMessage(errorText) ?? errorText;
    const busy = isWorkspaceBusyError(errorText);
    return (
      <div className="my-2 flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-error">{mapped}</p>
        {busy && onStop ? (
          <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2" onClick={onStop}>
            Stop
          </Button>
        ) : onRetry ? (
          <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
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

function CopyMessageButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const label = state === "copied" ? "Copied" : state === "error" ? "Couldn't copy" : "Copy";

  return (
    <Button
      aria-label={label}
      className={cn(state !== "idle" && "h-6 w-auto px-2")}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            if (timer.current != null) window.clearTimeout(timer.current);
            setState("copied");
            timer.current = window.setTimeout(() => setState("idle"), 1500);
          },
          () => {
            if (timer.current != null) window.clearTimeout(timer.current);
            setState("error");
            timer.current = window.setTimeout(() => setState("idle"), 1500);
          },
        );
      }}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
    >
      {state === "copied" ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {state === "copied" ? "Copied" : state === "error" ? "Couldn't copy" : null}
    </Button>
  );
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
  onRetry,
  onStop,
}: {
  message: GalleryChatMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
  onStop?: () => void;
}) {
  const textForCopy = messagePlainText(message);
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
      onRetry={onRetry}
      onStop={onStop}
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
        {textForCopy ? (
          <MessageFooter
            className={
              message.role === "user"
                ? "max-h-0 overflow-hidden p-0 opacity-0 transition-[max-height,opacity] group-hover/message:max-h-8 group-hover/message:opacity-100 group-focus-within/message:max-h-8 group-focus-within/message:opacity-100"
                : undefined
            }
          >
            <CopyMessageButton text={textForCopy} />
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  );
}
