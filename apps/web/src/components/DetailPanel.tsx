import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { formatMm, measureDelta } from "@/lib/measure";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useStore } from "@/state/store";

function SelectionByline() {
  const session = useProjectSession();
  const sel = session.doc.selection;
  if (!sel || sel.by === session.you.id) return null;
  return <div className="mb-2 text-[11px] text-zinc-500">Selected on {sel.byLabel}</div>;
}

function SelectionBody() {
  const { review, selectedId, pickedRef, select, isolate, setVisible, showAll, hiddenIds } =
    useStore(
      useShallow((s) => ({
        review: s.review,
        selectedId: s.selectedId,
        pickedRef: s.pickedRef,
        select: s.select,
        isolate: s.isolate,
        setVisible: s.setVisible,
        showAll: s.showAll,
        hiddenIds: s.hiddenIds,
      })),
    );
  const part = selectedId !== null ? review?.parts[selectedId] : undefined;
  if (!review || (!part && !pickedRef)) return null;
  const shown = part ? !hiddenIds.has(part.id) : true;
  const ref = pickedRef ?? part?.cadRef ?? null;

  return (
    <>
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">Selection</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500" onClick={() => select(null)}>
          Clear
        </Button>
      </header>
      {part ? (
        <div className="mb-2 flex items-center gap-2 text-[13px]">
          <span
            className="size-3 shrink-0 rounded-[2px] border border-zinc-300"
            style={{ background: part.color }}
          />
          <span className="min-w-0 truncate font-medium">{part.name}</span>
        </div>
      ) : null}
      {ref ? (
        <div className="mb-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-100 px-2 py-1 text-[12px]">
            {ref}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(ref)}
          >
            Copy
          </Button>
        </div>
      ) : null}
      <SelectionByline />
      {part ? (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setVisible(part.id, !shown)}
          >
            {shown ? "Hide" : "Show"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => isolate(part.id)}>
            Isolate
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => showAll()}>
            Show all
          </Button>
        </div>
      ) : null}
    </>
  );
}

function MeasureBody() {
  const { measure, clearMeasure, setTool } = useStore(
    useShallow((s) => ({ measure: s.measure, clearMeasure: s.clearMeasure, setTool: s.setTool })),
  );
  const a = measure.a;
  const b = measure.b;
  const delta = measureDelta(a, b);

  return (
    <>
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">Measure</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500" onClick={() => setTool("select")}>
          Done
        </Button>
      </header>
      <p className="mb-2 text-[12px] text-zinc-500">Click two places on the model.</p>
      <div className="mb-1 truncate font-mono text-[12px]">1 {a?.cadRef ?? "—"}</div>
      <div className="mb-3 truncate font-mono text-[12px]">2 {b?.cadRef ?? "—"}</div>
      {delta ? (
        <div className="mb-3">
          <div className="text-[16px] font-medium">{formatMm(delta.dist)}</div>
          <div className="mt-1 font-mono text-[11px] text-zinc-500">
            ΔX {formatMm(delta.dx)}
            <br />
            ΔY {formatMm(delta.dy)}
            <br />
            ΔZ {formatMm(delta.dz)}
          </div>
        </div>
      ) : null}
      <Button type="button" size="sm" variant="secondary" onClick={() => clearMeasure()}>
        Clear
      </Button>
    </>
  );
}

export function DetailPanel() {
  const { review, selectedId, pickedRef, tool } = useStore(
    useShallow((s) => ({
      review: s.review,
      selectedId: s.selectedId,
      pickedRef: s.pickedRef,
      tool: s.tool,
    })),
  );
  const part = selectedId !== null ? review?.parts[selectedId] : undefined;
  if (!review) return null;
  if (tool !== "measure" && !part && !pickedRef) return null;

  return (
    <aside className="pointer-events-auto absolute top-16 right-4 z-10 w-[260px] rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg">
      {tool === "measure" ? <MeasureBody /> : <SelectionBody />}
    </aside>
  );
}
