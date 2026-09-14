import { Container, Text } from "@react-three/uikit";
import { useXR } from "@react-three/xr";
import { useContext } from "react";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "@/state/store";
import { FeedbackContext, ToolBtn } from "@/xr/ui/ToolBtn";
import { enterAR, enterVR } from "@/xrStore";

export function SettingsCard() {
  const { axesVisible, setAxesVisible, setPage, studioDark, setStudioDark } = useStore(
    useShallow((s) => ({
      axesVisible: s.axesVisible,
      setAxesVisible: s.setAxesVisible,
      setPage: s.setPage,
      studioDark: s.studioDark,
      setStudioDark: s.setStudioDark,
    })),
  );
  const session = useXR((s) => s.session);
  const mode = useXR((s) => s.mode);
  const feedback = useContext(FeedbackContext);
  const ar = mode === "immersive-ar";
  const studio = mode === "immersive-vr" && !studioDark;
  const dark = mode === "immersive-vr" && studioDark;
  return (
    <Container
      width={192}
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
      <Container flexDirection="row" gap={4} width="100%">
        <ToolBtn id="back" label="Back" onClick={() => setPage("tree")} />
        <ToolBtn id="help" label="Controls" onClick={() => setPage("help")} />
      </Container>
      <Container flexDirection="row" gap={2} width="100%" flexShrink={0}>
        <ToolBtn
          id="passthrough"
          label="AR"
          active={ar}
          onClick={() => {
            setStudioDark(false);
            if (!ar) void enterAR();
          }}
        />
        <ToolBtn
          id="studio"
          label="Studio"
          active={studio}
          onClick={() => {
            setStudioDark(false);
            if (mode !== "immersive-vr") void enterVR();
          }}
        />
        <ToolBtn
          id="dark"
          label="Dark"
          active={dark}
          onClick={() => {
            setStudioDark(true);
            if (mode !== "immersive-vr") void enterVR();
          }}
        />
      </Container>
      <ToolBtn
        id="axes"
        label={axesVisible ? "Axes on" : "Axes off"}
        active={axesVisible}
        onClick={() => setAxesVisible((open) => !open)}
      />
      <Container
        height={36}
        width="100%"
        flexShrink={0}
        alignItems="center"
        justifyContent="center"
        borderRadius={6}
        backgroundColor="#dc2626"
        hover={{ backgroundColor: "#b91c1c" }}
        active={{ backgroundColor: "#991b1b" }}
        onClick={() => {
          feedback.click();
          void session?.end();
        }}
        onHoverChange={(hovered) => feedback.hover("exit", hovered)}
      >
        <Text fontSize={15} color="#fafafa">
          Exit
        </Text>
      </Container>
    </Container>
  );
}
