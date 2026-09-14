import { Axis3d, Focus, Home, Ruler, Scan } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { useStore } from "@/state/store";
import { cn } from "@/lib/utils";

type Props = {
  onHome: () => void;
  onFit: () => void;
};

export function Toolbar({ onHome, onFit }: Props) {
  const {
    selectedId,
    isolate,
    axesVisible,
    setAxesVisible,
    tool,
    setTool,
  } = useStore(
    useShallow((s) => ({
      selectedId: s.selectedId,
      isolate: s.isolate,
      axesVisible: s.axesVisible,
      setAxesVisible: s.setAxesVisible,
      tool: s.tool,
      setTool: s.setTool,
    })),
  );
  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-xl border border-zinc-200 bg-white/95 p-1 shadow-lg">
      <Button type="button" variant="secondary" size="sm" className="h-9 w-9 p-0" title="Home" onClick={onHome}>
        <Home />
      </Button>
      <Button type="button" variant="secondary" size="sm" className="h-9 w-9 p-0" title="Fit" onClick={onFit}>
        <Scan />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 w-9 p-0"
        title="Isolate"
        disabled={selectedId === null}
        onClick={() => selectedId !== null && isolate(selectedId)}
      >
        <Focus />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={cn("h-9 w-9 p-0", tool === "measure" && "bg-zinc-200")}
        title="Measure"
        onClick={() => setTool(tool === "measure" ? "select" : "measure")}
      >
        <Ruler />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={cn("h-9 w-9 p-0", axesVisible && "bg-zinc-200")}
        title="World axes"
        onClick={() => setAxesVisible((open) => !open)}
      >
        <Axis3d />
      </Button>
    </div>
  );
}
