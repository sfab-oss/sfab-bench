import { Container, Input, Text } from "@react-three/uikit";
import { ChevronDown, History, Mic, Plus, Send, Square } from "@react-three/uikit-lucide";
import { memo, useRef, useState, type ReactNode } from "react";

import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import type { AIDataPart } from "@/components/chat/ai-types";
import { messagePlainText, useViewerChat } from "@/components/chat/useViewerChat";
import { toolTitle } from "@/components/ui/tool";
import { splitWorkedParts, workedLabel } from "@/components/ui/worked";
import { ChatModelChip } from "@/xr/ui/ChatModelCard";
import { ToolBtn } from "@/xr/ui/ToolBtn";
import { asciiSafe, UikitMarkdown } from "@/xr/ui/UikitMarkdown";
import { useXrChatScroll } from "@/xr/ui/useXrChatScroll";
import { VoiceRecordRow } from "@/xr/ui/VoiceRecordRow";
import { useXrChatRuntime } from "@/xr/ui/XrChatRuntime";

const MUTED = "#71717a";
const BODY = "#18181b";

function workedDurationSeconds(message: GalleryChatMessage) {
  const n = message.metadata?.responseTime;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return;
  return n / 1000;
}

function XrPlan({ entries }: { entries: AIDataPart["plan"]["entries"] }) {
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={3}>
      {entries.map((entry, i) => (
        <Text key={i} fontSize={12} color={entry.status === "completed" ? MUTED : BODY}>
          {entry.status === "completed" ? "[x] " : "[ ] "}
          {entry.content}
        </Text>
      ))}
    </Container>
  );
}

function dump(value: unknown) {
  if (value === undefined) return "";
  if (typeof value === "string") return asciiSafe(value);
  try {
    return asciiSafe(JSON.stringify(value));
  } catch {
    return "";
  }
}

function XrToolLine({
  part,
}: {
  part: GalleryChatMessage["parts"][number];
}) {
  const [open, setOpen] = useState(false);
  const toolName =
    "toolName" in part && typeof part.toolName === "string"
      ? part.toolName
      : part.type.startsWith("tool-")
        ? part.type.slice(5)
        : "tool";
  const input = "input" in part ? part.input : undefined;
  const output = "output" in part ? part.output : undefined;
  const label = toolTitle(toolName, input);
  const inText = dump(input);
  const outText = dump(output);
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
      <Container flexDirection="row" alignItems="center" gap={4} onClick={() => setOpen((v) => !v)}>
        <ChevronDown width={12} height={12} color={MUTED} transformRotateZ={open ? 0 : 90} />
        <Text fontSize={12} color={MUTED}>
          {asciiSafe(label)}
        </Text>
      </Container>
      {open ? (
        <Container width="100%" flexShrink={0} flexDirection="column" gap={2} paddingLeft={16}>
          {inText ? (
            <>
              <Text fontSize={11} color={MUTED} fontWeight="semi-bold">
                Input
              </Text>
              <Text fontSize={11} color={MUTED}>
                {inText}
              </Text>
            </>
          ) : null}
          {outText ? (
            <>
              <Text fontSize={11} color={MUTED} fontWeight="semi-bold">
                Output
              </Text>
              <Text fontSize={11} color={MUTED}>
                {outText}
              </Text>
            </>
          ) : null}
        </Container>
      ) : null}
    </Container>
  );
}

function XrReasoning({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const streamed = useRef(isStreaming);
  if (isStreaming) streamed.current = true;
  const open = userOpen ?? (isStreaming || streamed.current);
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
      <Container flexDirection="row" alignItems="center" gap={4} onClick={() => setUserOpen(!open)}>
        <ChevronDown width={12} height={12} color={MUTED} transformRotateZ={open ? 0 : 90} />
        <Text fontSize={12} color={MUTED}>
          {isStreaming ? "Reasoning..." : "Reasoning"}
        </Text>
      </Container>
      {open ? (
        <Text fontSize={12} color="#52525b">
          {asciiSafe(text)}
        </Text>
      ) : null}
    </Container>
  );
}

function XrWorked({
  children,
  isStreaming,
  duration,
}: {
  children: ReactNode;
  isStreaming: boolean;
  duration?: number;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? isStreaming;
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={4}>
      <Container flexDirection="row" alignItems="center" gap={4} onClick={() => setUserOpen(!open)}>
        <ChevronDown width={12} height={12} color={MUTED} transformRotateZ={open ? 0 : 90} />
        <Text fontSize={12} color={MUTED}>
          {workedLabel({ isStreaming, duration })}
        </Text>
      </Container>
      {open ? (
        <Container width="100%" flexShrink={0} flexDirection="column" gap={4} paddingLeft={8}>
          {children}
        </Container>
      ) : null}
    </Container>
  );
}

function XrPart({
  part,
  isStreaming,
}: {
  part: GalleryChatMessage["parts"][number];
  isStreaming?: boolean;
}) {
  if (part.type === "text" && "text" in part && part.text.trim()) {
    return <UikitMarkdown markdown={part.text} />;
  }
  if (part.type === "reasoning" && "text" in part) {
    return <XrReasoning isStreaming={Boolean(isStreaming)} text={part.text} />;
  }
  if (part.type === "data-plan") {
    return <XrPlan entries={(part as { data: AIDataPart["plan"] }).data.entries} />;
  }
  if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
    return <XrToolLine part={part} />;
  }
  return null;
}

function XrAssistantParts({
  message,
  isStreaming,
}: {
  message: GalleryChatMessage;
  isStreaming: boolean;
}) {
  const duration = workedDurationSeconds(message);
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={8}>
      {splitWorkedParts(message.parts).map((segment) => {
        if (segment.kind === "worked") {
          const start = segment.items[0]?.index ?? 0;
          return (
            <XrWorked key={`w-${start}`} isStreaming={isStreaming} duration={duration}>
              {segment.items.map((item) => (
                <XrPart key={item.index} isStreaming={isStreaming} part={item.part} />
              ))}
            </XrWorked>
          );
        }
        return <XrPart key={segment.item.index} isStreaming={isStreaming} part={segment.item.part} />;
      })}
    </Container>
  );
}

const XrMessageRow = memo(function XrMessageRow({
  message,
  isStreaming,
}: {
  message: GalleryChatMessage;
  isStreaming: boolean;
}) {
  const mine = message.role === "user";
  const text = messagePlainText(message);
  if (mine && !text) return null;
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" alignItems={mine ? "flex-end" : "flex-start"}>
      {mine ? (
        <Container
          width="auto"
          maxWidth="80%"
          flexShrink={0}
          alignSelf="flex-end"
          padding={8}
          borderRadius={10}
          backgroundColor="#e4e4e7"
        >
          <Text fontSize={13} color={BODY}>
            {asciiSafe(text)}
          </Text>
        </Container>
      ) : (
        <Container maxWidth="100%" width="100%" flexShrink={0}>
          <XrAssistantParts isStreaming={isStreaming} message={message} />
        </Container>
      )}
    </Container>
  );
}, (prev, next) => prev.isStreaming === next.isStreaming && prev.message.id === next.message.id && prev.message.parts === next.message.parts);

function XrChatSession({
  modelsOpen,
  onToggleModels,
}: {
  modelsOpen: boolean;
  onToggleModels: () => void;
}) {
  const runtime = useXrChatRuntime();
  const { ref: listRef, atEnd, onScroll, jumpToEnd } = useXrChatScroll();
  if (!runtime) return null;
  const { messages, busy, error, draft, setDraft, send, stop, voice } = runtime;
  const submit = () => {
    send();
    jumpToEnd();
  };

  return (
    <>
      <Container flexGrow={1} minHeight={0} width="100%" positionType="relative">
        <Container
          ref={listRef}
          flexGrow={1}
          minHeight={0}
          width="100%"
          overflow="scroll"
          gap={6}
          flexDirection="column"
          paddingTop={4}
          onScroll={onScroll}
        >
          {messages.length === 0 ? (
            <Text fontSize={13} color="#71717a">
              Ask for a CAD change. Try "What am I looking at?" then a size change.
            </Text>
          ) : (
            messages.map((message, mi) => (
              <XrMessageRow
                key={message.id}
                isStreaming={busy && mi === messages.length - 1 && message.role !== "user"}
                message={message}
              />
            ))
          )}
          {error ? (
            <Text fontSize={12} color="#dc2626">
              {error.message}
            </Text>
          ) : null}
        </Container>
        {!atEnd ? (
          <Container
            positionType="absolute"
            positionBottom={8}
            positionLeft={0}
            positionRight={0}
            alignItems="center"
            pointerEvents="none"
            zIndexOffset={4}
          >
            <Container pointerEvents="auto">
              <ToolBtn
                id="xr-chat-jump"
                icon={ChevronDown}
                tip="Jump to latest"
                grow={false}
                onClick={jumpToEnd}
              />
            </Container>
          </Container>
        ) : null}
      </Container>
      <Container width="100%" height={1} flexShrink={0} backgroundColor="#e4e4e7" />
      {voice.active ? (
        <VoiceRecordRow
          elapsedMs={voice.elapsedMs}
          error={voice.error}
          level={voice.level}
          recording={voice.recording}
          transcribing={voice.busy}
          onCancel={voice.cancel}
          onComplete={voice.complete}
        />
      ) : (
        <Container flexDirection="row" flexShrink={0} alignItems="center" gap={4} width="100%">
          <Container flexGrow={1} minWidth={0} height={36} borderRadius={8} backgroundColor="#f4f4f5" paddingX={8}>
            <Input
              value={draft}
              onValueChange={(value: string) => setDraft(value)}
              placeholder="Ask for a change..."
              disabled={busy}
              width="100%"
              height="100%"
              fontSize={14}
              color="#18181b"
            />
          </Container>
          <ToolBtn
            id="xr-chat-mic"
            icon={Mic}
            tip={voice.error ?? "Tap to talk"}
            grow={false}
            onClick={() => {
              if (!busy) void voice.start();
            }}
          />
          {busy ? (
            <ToolBtn id="xr-chat-stop" icon={Square} tip="Stop" grow={false} onClick={() => stop()} />
          ) : (
            <ToolBtn id="xr-chat-send" icon={Send} tip="Send" grow={false} onClick={submit} />
          )}
        </Container>
      )}
      {voice.error && !voice.active ? (
        <Text fontSize={11} color="#dc2626">
          {asciiSafe(voice.error)}
        </Text>
      ) : null}
      <Container flexDirection="row" flexShrink={0} width="100%" justifyContent="flex-start">
        <ChatModelChip active={modelsOpen} onClick={onToggleModels} />
      </Container>
    </>
  );
}

export function ChatCard({
  historyOpen,
  onToggleHistory,
  modelsOpen,
  onToggleModels,
  width = 340,
  height = 520,
}: {
  historyOpen: boolean;
  onToggleHistory: () => void;
  modelsOpen: boolean;
  onToggleModels: () => void;
  width?: number;
  height?: number;
}) {
  const { threads, threadId, newThread } = useViewerChat();
  const active = threads.find((t) => t.id === threadId);

  return (
    <Container
      width={width}
      height={height}
      padding={8}
      gap={6}
      flexDirection="column"
      backgroundColor="#fafafa"
      borderRadius={12}
      pixelSize={0.001}
      pointerEvents="auto"
    >
      <Container flexDirection="row" flexShrink={0} alignItems="center" gap={4} width="100%">
        <Container flexGrow={1} minWidth={0} flexDirection="row" alignItems="center" gap={6}>
          <Text fontSize={14} color="#18181b">
            {active?.title ?? "Assistant"}
          </Text>

        </Container>
        <ToolBtn
          id="xr-chat-history"
          icon={History}
          tip="History"
          grow={false}
          active={historyOpen}
          onClick={onToggleHistory}
        />
        <ToolBtn id="xr-chat-new" icon={Plus} tip="New chat" grow={false} onClick={() => void newThread()} />
      </Container>
      <Container width="100%" height={1} flexShrink={0} backgroundColor="#e4e4e7" />
      {threadId ? (
        <XrChatSession modelsOpen={modelsOpen} onToggleModels={onToggleModels} />
      ) : (
        <Container flexGrow={1}>
          <Text fontSize={13} color="#71717a">
            Loading...
          </Text>
        </Container>
      )}
    </Container>
  );
}
