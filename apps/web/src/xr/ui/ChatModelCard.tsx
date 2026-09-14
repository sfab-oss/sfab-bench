import { Container, Input, Text } from "@react-three/uikit";
import { useContext, useEffect, useMemo, useState } from "react";

import { type HarnessModel, harnessModelName, useHarnesses } from "@/hooks/useHarnesses";
import {
  CHAT_EFFORTS,
  CHAT_EFFORT_LABEL,
  HARNESS_IDS,
  harnessSupportsEffort,
  type ChatEffort,
  type HarnessId,
} from "@/lib/harness";
import { useStore } from "@/state/store";
import { asciiSafe } from "@/xr/ui/UikitMarkdown";
import { FeedbackContext, PRESSED, ToolBtn } from "@/xr/ui/ToolBtn";
import { XrProviderMark } from "@/xr/ui/XrProviderMark";

export function ChatModelCard({ onClose }: { onClose: () => void }) {
  const chatHarness = useStore((s) => s.chatHarness);
  const chatModel = useStore((s) => s.chatModel);
  const chatEffort = useStore((s) => s.chatEffort);
  const setChatSelection = useStore((s) => s.setChatSelection);
  const setChatEffort = useStore((s) => s.setChatEffort);
  const { harnesses, ready, error } = useHarnesses();
  const [rail, setRail] = useState<HarnessId>(chatHarness);
  const [query, setQuery] = useState("");
  const feedback = useContext(FeedbackContext);

  useEffect(() => {
    setRail(chatHarness);
  }, [chatHarness]);

  const active = harnesses.find((h) => h.id === rail);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const models = (active?.models ?? []).filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.slug.toLowerCase().includes(q) ||
        (m.group ?? "").toLowerCase().includes(q)
      );
    });
    const byGroup = new Map<string, HarnessModel[]>();
    for (const m of models) {
      const key = m.group ?? active?.label ?? "";
      const list = byGroup.get(key) ?? [];
      list.push(m);
      byGroup.set(key, list);
    }
    return [...byGroup.entries()];
  }, [active, q]);

  const notReady = active != null && active.status !== "ready";

  return (
    <Container
      width={240}
      height={308}
      padding={8}
      gap={6}
      flexDirection="column"
      backgroundColor="#fafafa"
      borderRadius={12}
      borderWidth={1}
      borderColor="#e4e4e7"
      pixelSize={0.001}
      pointerEvents="auto"
    >
      <Container flexDirection="row" gap={4} width="100%" flexShrink={0}>
        <ToolBtn id="chat-model-back" label="Back" onClick={onClose} />
      </Container>
      <Container flexDirection="row" flexShrink={0} gap={4} width="100%">
        {HARNESS_IDS.map((id) => {
          const info = harnesses.find((h) => h.id === id);
          const dim = info != null && info.status !== "ready";
          const selected = rail === id;
          return (
            <Container
              key={id}
              width={36}
              height={36}
              flexShrink={0}
              alignItems="center"
              justifyContent="center"
              borderRadius={8}
              backgroundColor={selected ? "#dbeafe" : "#f4f4f5"}
              hover={{ backgroundColor: selected ? "#dbeafe" : "#e4e4e7" }}
              active={PRESSED}
              opacity={dim ? 0.45 : 1}
              onHoverChange={(hovered: boolean) => feedback.hover(`model-rail-${id}`, hovered)}
              onClick={() => {
                feedback.click();
                setRail(id);
                setQuery("");
              }}
            >
              <XrProviderMark id={id} size={18} />
            </Container>
          );
        })}
      </Container>
      {harnessSupportsEffort(rail) ? (
        <Container flexDirection="row" flexShrink={0} gap={4} width="100%">
          {CHAT_EFFORTS.map((value) => {
            const selected = chatEffort === value;
            return (
              <Container
                key={value}
                flexGrow={1}
                height={28}
                alignItems="center"
                justifyContent="center"
                borderRadius={8}
                backgroundColor={selected ? "#dbeafe" : "#f4f4f5"}
                hover={{ backgroundColor: selected ? "#dbeafe" : "#e4e4e7" }}
                active={PRESSED}
                onHoverChange={(hovered: boolean) => feedback.hover(`effort-${value}`, hovered)}
                onClick={() => {
                  feedback.click();
                  setChatEffort(value as ChatEffort);
                }}
              >
                <Text fontSize={11} color="#18181b">
                  {asciiSafe(CHAT_EFFORT_LABEL[value])}
                </Text>
              </Container>
            );
          })}
        </Container>
      ) : null}
      <Container width="100%" height={32} flexShrink={0} borderRadius={8} backgroundColor="#f4f4f5" paddingX={8}>
        <Input
          value={query}
          onValueChange={(value: string) => setQuery(value)}
          placeholder="Search models..."
          width="100%"
          height="100%"
          fontSize={13}
          color="#18181b"
        />
      </Container>
      <Container flexGrow={1} minHeight={0} width="100%" overflow="scroll" gap={2} flexDirection="column">
        {!ready ? (
          <>
            {Array.from({ length: 6 }, (_, i) => (
              <Container key={i} width="100%" height={24} flexShrink={0} borderRadius={6} backgroundColor="#e4e4e7" />
            ))}
          </>
        ) : error ? (
          <Text fontSize={12} color="#71717a">
            Could not load models
          </Text>
        ) : notReady ? (
          <Text fontSize={12} color="#71717a">
            {asciiSafe(active.detail ?? active.status)}
          </Text>
        ) : groups.length === 0 ? (
          <Text fontSize={12} color="#71717a">
            No matches
          </Text>
        ) : (
          groups.map(([group, models]) => (
            <Container key={group} width="100%" flexShrink={0} flexDirection="column" gap={2}>
              {group ? (
                <Text fontSize={11} color="#a1a1aa">
                  {asciiSafe(group)}
                </Text>
              ) : null}
              {models.map((m) => {
                const selected = rail === chatHarness && m.slug === chatModel;
                return (
                  <Container
                    key={m.slug}
                    width="100%"
                    flexShrink={0}
                    padding={6}
                    borderRadius={8}
                    backgroundColor={selected ? "#dbeafe" : "#f4f4f5"}
                    hover={{ backgroundColor: selected ? "#dbeafe" : "#e4e4e7" }}
                    active={PRESSED}
                    onHoverChange={(hovered: boolean) => feedback.hover(`model-${m.slug}`, hovered)}
                    onClick={() => {
                      feedback.click();
                      setChatSelection(rail, m.slug);
                      onClose();
                    }}
                  >
                    <Text fontSize={13} color="#18181b">
                      {asciiSafe(m.name)}
                    </Text>
                  </Container>
                );
              })}
            </Container>
          ))
        )}
      </Container>
    </Container>
  );
}

export function ChatModelChip({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  const chatHarness = useStore((s) => s.chatHarness);
  const chatModel = useStore((s) => s.chatModel);
  const { harnesses } = useHarnesses();
  const name = asciiSafe(harnessModelName(harnesses, chatHarness, chatModel));
  const feedback = useContext(FeedbackContext);
  return (
    <Container
      flexDirection="row"
      flexShrink={0}
      alignItems="center"
      gap={6}
      height={28}
      paddingX={8}
      borderRadius={8}
      backgroundColor={active ? "#dbeafe" : "#f4f4f5"}
      hover={{ backgroundColor: active ? "#dbeafe" : "#e4e4e7" }}
      active={PRESSED}
      onHoverChange={(hovered: boolean) => feedback.hover("xr-chat-model", hovered)}
      onClick={() => {
        feedback.click();
        onClick();
      }}
    >
      <XrProviderMark id={chatHarness} size={14} />
      <Text fontSize={12} color="#18181b">
        {name}
      </Text>
    </Container>
  );
}
