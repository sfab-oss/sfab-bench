import { Container, Text } from "@react-three/uikit";

import { FilesList } from "@/xr/ui/FilesList";
import { ToolBtn } from "@/xr/ui/ToolBtn";
import { useXrTheme } from "@/xr/ui/theme";

export function FilesCard({ onClose }: { onClose: () => void }) {
  const theme = useXrTheme();
  return (
    <Container
      width={220}
      height={280}
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
      <Container
        flexDirection="row"
        gap={4}
        width="100%"
        flexShrink={0}
        alignItems="center"
      >
        <ToolBtn id="files-back" label="Back" onClick={onClose} />
        <Text fontSize={13} color={theme.text}>
          Open
        </Text>
      </Container>
      <Container
        flexGrow={1}
        minHeight={0}
        width="100%"
        overflow="scroll"
        gap={2}
        flexDirection="column"
      >
        <FilesList onPick={onClose} />
      </Container>
    </Container>
  );
}
