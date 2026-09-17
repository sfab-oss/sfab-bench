import { Container, Text } from "@react-three/uikit";
import { Check, Loader, X } from "@react-three/uikit-lucide";

import { formatVoiceTime } from "@/hooks/useVoiceInput";
import { ToolBtn } from "@/xr/ui/ToolBtn";
import { useXrTheme } from "@/xr/ui/theme";

function Wave({
  elapsedMs,
  frozen,
  level,
}: {
  elapsedMs: number;
  frozen?: boolean;
  level: number;
}) {
  const theme = useXrTheme();
  return (
    <Container
      flexGrow={1}
      minWidth={0}
      height={36}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      gap={2}
    >
      {Array.from({ length: 12 }, (_, i) => {
        const phase = Math.abs(
          Math.sin(i * 0.7 + (frozen ? 0 : elapsedMs / 180))
        );
        const h = frozen ? 6 : 4 + (6 + level * 18) * phase;
        return (
          <Container
            key={i}
            width={2}
            height={h}
            flexShrink={0}
            borderRadius={1}
            backgroundColor={frozen ? theme.divider : "#ef4444"}
          />
        );
      })}
    </Container>
  );
}

export function VoiceRecordRow({
  recording,
  transcribing,
  elapsedMs,
  level,
  error,
  onCancel,
  onComplete,
}: {
  recording: boolean;
  transcribing: boolean;
  elapsedMs: number;
  level: number;
  error?: string | null;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const theme = useXrTheme();
  return (
    <Container
      flexDirection="row"
      flexShrink={0}
      alignItems="center"
      gap={4}
      width="100%"
    >
      <ToolBtn
        id="xr-chat-voice-cancel"
        icon={X}
        tip="Cancel"
        grow={false}
        onClick={onCancel}
      />
      <Container
        flexGrow={1}
        minWidth={0}
        height={36}
        borderRadius={8}
        backgroundColor={theme.muted}
        paddingX={8}
        flexDirection="row"
        alignItems="center"
        gap={6}
      >
        <Wave elapsedMs={elapsedMs} frozen={transcribing} level={level} />
        <Text fontSize={12} color={theme.subtle}>
          {transcribing ? "..." : formatVoiceTime(elapsedMs)}
        </Text>
      </Container>
      <ToolBtn
        id="xr-chat-voice-done"
        icon={transcribing ? Loader : Check}
        tip={error ?? (transcribing ? "Transcribing..." : "Done")}
        grow={false}
        onClick={() => {
          if (recording && !transcribing) onComplete();
        }}
      />
    </Container>
  );
}
