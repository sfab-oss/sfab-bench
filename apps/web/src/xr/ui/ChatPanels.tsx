import { useEffect, useState } from "react";

import { loadHarnesses } from "@/hooks/useHarnesses";
import { ChatCard } from "@/xr/ui/ChatCard";
import { ChatHistoryCard } from "@/xr/ui/ChatHistoryCard";
import { ChatModelCard } from "@/xr/ui/ChatModelCard";

type Overlay = "none" | "history" | "models";

export function ChatPanels({
  width = 340,
  height = 520,
}: {
  width?: number;
  height?: number;
}) {
  const [overlay, setOverlay] = useState<Overlay>("none");
  useEffect(() => {
    void loadHarnesses();
  }, []);
  const toggle = (next: Overlay) =>
    setOverlay((cur) => (cur === next ? "none" : next));
  return (
    <ChatCard
      width={width}
      height={height}
      historyOpen={overlay === "history"}
      onToggleHistory={() => toggle("history")}
      modelsOpen={overlay === "models"}
      onToggleModels={() => toggle("models")}
      overlay={
        overlay === "history" ? (
          <ChatHistoryCard onClose={() => setOverlay("none")} />
        ) : overlay === "models" ? (
          <ChatModelCard onClose={() => setOverlay("none")} />
        ) : null
      }
    />
  );
}
