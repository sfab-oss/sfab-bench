import { Container, Text } from "@react-three/uikit";

import { useViewerChat } from "@/components/chat/useViewerChat";
import { ToolBtn } from "@/xr/ui/ToolBtn";

export function ChatHistoryCard({ onClose }: { onClose: () => void }) {
  const { threads, threadId, openThread } = useViewerChat();
  return (
    <Container
      width={192}
      maxHeight={320}
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
        <ToolBtn id="chat-history-back" label="Back" onClick={onClose} />
      </Container>
      <Container flexGrow={1} width="100%" overflow="scroll" gap={4} flexDirection="column">
        {threads.length === 0 ? (
          <Text fontSize={13} color="#71717a">
            No chats yet
          </Text>
        ) : (
          threads.map((t) => (
            <Container
              key={t.id}
              width="100%"
              padding={8}
              borderRadius={8}
              backgroundColor={t.id === threadId ? "#e4e4e7" : "#f4f4f5"}
              hover={{ backgroundColor: "#e4e4e7" }}
              onClick={() => {
                void openThread(t.id);
                onClose();
              }}
            >
              <Text fontSize={13} color="#18181b">
                {t.title}
              </Text>
            </Container>
          ))
        )}
      </Container>
    </Container>
  );
}
