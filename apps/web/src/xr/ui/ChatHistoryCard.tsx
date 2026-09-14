import { Container, Text } from "@react-three/uikit";

import { useViewerChat } from "@/components/chat/useViewerChat";
import { ToolBtn } from "@/xr/ui/ToolBtn";
import { useXrTheme } from "@/xr/ui/theme";

export function ChatHistoryCard({ onClose }: { onClose: () => void }) {
  const { threads, threadId, openThread } = useViewerChat();
  const theme = useXrTheme();
  return (
    <Container
      width={192}
      maxHeight={320}
      padding={8}
      gap={6}
      flexDirection="column"
      backgroundColor={theme.card}
      borderRadius={12}
      borderWidth={1}
      borderColor={theme.border}
      pixelSize={0.001}
      pointerEvents="auto"
    >
      <Container flexDirection="row" gap={4} width="100%" flexShrink={0}>
        <ToolBtn id="chat-history-back" label="Back" onClick={onClose} />
      </Container>
      <Container flexGrow={1} width="100%" overflow="scroll" gap={4} flexDirection="column">
        {threads.length === 0 ? (
          <Text fontSize={13} color={theme.subtle}>
            No chats yet
          </Text>
        ) : (
          threads.map((t) => (
            <Container
              key={t.id}
              width="100%"
              padding={8}
              borderRadius={8}
              backgroundColor={t.id === threadId ? theme.hover : theme.muted}
              hover={{ backgroundColor: theme.hover }}
              onClick={() => {
                void openThread(t.id);
                onClose();
              }}
            >
              <Text fontSize={13} color={theme.text}>
                {t.title}
              </Text>
            </Container>
          ))
        )}
      </Container>
    </Container>
  );
}
