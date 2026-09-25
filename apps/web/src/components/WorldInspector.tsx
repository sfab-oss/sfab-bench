import {
  ARDUINO_PINS,
  maskHasPin,
  type WorldPinState,
} from "@sfab-bench/contract";
import { useEffect } from "react";

import { SerialConsole } from "@/components/SerialConsole";
import { SourceView } from "@/components/SourceView";
import { Button } from "@/components/ui/button";
import { sendBoardSerial } from "@/hooks/useWorldRun";
import { boardStatusLabel } from "@/lib/board-status";
import { overlayMaxHeight } from "@/lib/layout";
import {
  activeEscLayer,
  compactChatSheetOpen,
  isEditableTarget,
  probeEscLayers,
} from "@/lib/shortcuts";
import { relFromWorldFile } from "@/lib/world-assets";
import {
  formatJointReadout,
  formatLiveDegrees,
  formatPartWire,
  outlinePartLabel,
  type WorldOutline,
  type WorldOutlineBoard,
  type WorldOutlineJoint,
  type WorldOutlineLink,
  type WorldOutlinePart,
} from "@/lib/world-outline";
import {
  type BoardConsoleEntry,
  clearBoardReject,
  useBoardConsole,
} from "@/state/board-console";
import { useWorld, type WorldSelection, worldStore } from "@/state/world";

function useWorldSelectionEsc() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!worldStore.getState().selection) return;
      if (isEditableTarget(event.target, document.activeElement)) return;
      const layers = {
        ...probeEscLayers(document),
        compactChat: compactChatSheetOpen(document),
      };
      if (activeEscLayer(layers)) return;
      worldStore.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const EMPTY_PARTS: readonly WorldOutlinePart[] = [];

function transcriptText(entries: readonly BoardConsoleEntry[]): string {
  let text = "";
  for (const entry of entries) {
    if (entry.kind === "out") {
      text += entry.text;
      continue;
    }
    const line = entry.text.endsWith("\n") ? entry.text : `${entry.text}\n`;
    text += `‹ sent by ${entry.by} › ${line}`;
  }
  return text;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-[12px]" title={value}>
        {value}
      </div>
    </div>
  );
}

function OutlineBody({ outline }: { outline: WorldOutline | null }) {
  const select = (selection: NonNullable<WorldSelection>) => {
    worldStore.getState().select(selection);
  };
  if (!outline) {
    return (
      <p className="text-[12px] text-muted-foreground">Reading the world…</p>
    );
  }
  const empty =
    outline.robots.length === 0 &&
    outline.parts.length === 0 &&
    outline.boards.length === 0;
  if (empty) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This world has no robots, parts, or boards.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {outline.robots.map((robot) => (
        <div key={robot.id}>
          <div className="px-1 text-[12px] font-medium">{robot.id}</div>
          {robot.links.map((link) => (
            <button
              key={link.name}
              type="button"
              className="flex w-full items-baseline gap-2 rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-muted"
              onClick={() =>
                select({ kind: "link", robot: robot.id, link: link.name })
              }
            >
              <span className="min-w-0 flex-1 truncate">{link.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {link.joint?.name ?? "root"}
              </span>
            </button>
          ))}
        </div>
      ))}
      {outline.parts.length > 0 ? (
        <div>
          <div className="px-1 text-[12px] font-medium">Parts</div>
          {outline.parts.map((part) => (
            <button
              key={part.id}
              type="button"
              className="flex w-full rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-muted"
              onClick={() => select({ kind: "part", part: part.id })}
            >
              {outlinePartLabel(part)}
            </button>
          ))}
        </div>
      ) : null}
      {outline.boards.length > 0 ? (
        <div>
          <div className="px-1 text-[12px] font-medium">Boards</div>
          {outline.boards.map((board) => (
            <button
              key={board.id}
              type="button"
              className="flex w-full rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-muted"
              onClick={() => select({ kind: "board", board: board.id })}
            >
              {board.id}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinkBody({
  robot,
  link,
  info,
  pending,
}: {
  robot: string;
  link: string;
  info: WorldOutlineLink | undefined;
  pending: boolean;
}) {
  const jointName = info?.joint?.name;
  const qpos = useWorld((s) =>
    jointName ? s.joints[robot]?.[jointName] : undefined
  );
  const joint = info?.joint ?? null;
  const meshes = info?.meshes ?? [];
  if (pending) {
    return (
      <p className="text-[12px] text-muted-foreground">Reading the world…</p>
    );
  }
  const readout = joint ? formatJointReadout(joint, qpos) : null;
  return (
    <>
      <Field label="Robot" value={robot} />
      <Field label="Link" value={link} />
      <Field
        label="Mesh"
        value={meshes.length > 0 ? meshes.join(", ") : "None"}
      />
      {joint && readout ? (
        <>
          <Field label="Joint" value={joint.name} />
          <Field label="Type" value={joint.type || "—"} />
          <Field label="Axis" value={joint.axis ? joint.axis.join(" ") : "—"} />
          {readout.limits ? (
            <Field label="Limits" value={readout.limits} />
          ) : null}
          <Field label={readout.label} value={readout.value} />
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">No parent joint.</p>
      )}
    </>
  );
}

function pulseOnPin(
  boardId: string,
  pin: string,
  parts: readonly WorldOutlinePart[],
  live: Record<string, { pulseUs: number | null }>
): number | null | undefined {
  const hit = parts.find((part) =>
    part.wires.some((wire) => wire.other === `${boardId}.${pin}`)
  );
  if (!hit) return undefined;
  return live[hit.id]?.pulseUs ?? null;
}

function pulseText(us: number | null): string {
  if (us === null) return "No signal";
  return `${Math.round(us)} µs`;
}

function commandText(deg: number | null): string {
  if (deg === null) return "—";
  const shown = Math.round(deg * 10) / 10;
  return `${shown.toFixed(1)}°`;
}

function PinTable({
  pins,
  boardId,
  parts,
  live,
}: {
  pins: WorldPinState | undefined;
  boardId: string;
  parts: readonly WorldOutlinePart[];
  live: Record<string, { pulseUs: number | null }>;
}) {
  if (!pins) {
    return (
      <p className="mb-3 text-[12px] text-muted-foreground">
        Pins appear with the next state.
      </p>
    );
  }
  return (
    <table className="mb-3 w-full border-collapse text-[11px]">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-0.5 font-medium">Pin</th>
          <th className="font-medium">Dir</th>
          <th className="font-medium">Level</th>
          <th className="font-medium">
            <span className="sr-only">Activity</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ARDUINO_PINS.map((pin) => {
          const active = maskHasPin(pins.toggled, pin);
          const pulse = pulseOnPin(boardId, pin, parts, live);
          const width =
            pulse === undefined || pulse === null
              ? null
              : `${Math.round(pulse)} µs`;
          return (
            <tr key={pin} className="font-mono">
              <td>{pin}</td>
              <td>{maskHasPin(pins.ddr, pin) ? "out" : "in"}</td>
              <td>{maskHasPin(pins.level, pin) ? "H" : "L"}</td>
              <td className="whitespace-nowrap">
                {active ? (
                  <span title="Toggled since the last state">●</span>
                ) : null}
                {width ? (
                  <span title="Servo pulse width">
                    {active ? " " : ""}
                    {width}
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function drivenJoint(
  outline: WorldOutline | null,
  drives: { robot: string; joint: string } | null
): WorldOutlineJoint | null {
  if (!outline || !drives) return null;
  const robot = outline.robots.find((item) => item.id === drives.robot);
  for (const link of robot?.links ?? []) {
    if (link.joint?.name === drives.joint) return link.joint;
  }
  return null;
}

function PartBody({
  id,
  info,
  pending,
}: {
  id: string;
  info: WorldOutlinePart | undefined;
  pending: boolean;
}) {
  const outline = useWorld((s) => s.outline);
  const live = useWorld((s) => s.parts[id]);
  const drives = info?.drives ?? null;
  const qpos = useWorld((s) =>
    drives ? s.joints[drives.robot]?.[drives.joint] : undefined
  );
  if (pending) {
    return (
      <p className="text-[12px] text-muted-foreground">Reading the world…</p>
    );
  }
  const joint = drivenJoint(outline, drives);
  const angle = joint
    ? formatJointReadout(joint, qpos).value
    : qpos === undefined
      ? "—"
      : `${formatLiveDegrees(qpos)}°`;
  const wires = info?.wires ?? [];
  return (
    <>
      <Field label="Part" value={id} />
      <Field label="Model" value={info?.model ?? "—"} />
      <div className="mb-1.5 min-w-0">
        <div className="text-[11px] text-muted-foreground">Wires</div>
        {wires.length === 0 ? (
          <div className="text-[12px]">None</div>
        ) : (
          wires.map((wire) => (
            <div
              key={`${wire.pin}:${wire.other}`}
              className="truncate font-mono text-[12px]"
              title={formatPartWire(wire)}
            >
              {formatPartWire(wire)}
            </div>
          ))
        )}
      </div>
      <Field label="Pulse" value={pulseText(live?.pulseUs ?? null)} />
      <Field label="Command" value={commandText(live?.commandDeg ?? null)} />
      {drives ? (
        <>
          <Field label="Joint" value={`${drives.robot}/${drives.joint}`} />
          <Field label="Angle" value={angle} />
        </>
      ) : null}
    </>
  );
}

function BoardBody({
  id,
  info,
  pending,
}: {
  id: string;
  info: WorldOutlineBoard | undefined;
  pending: boolean;
}) {
  const path = useWorld((s) => s.path);
  const playing = useWorld((s) => s.playing);
  const live = useWorld((s) => s.boards[id]);
  const pins = useWorld((s) => s.pins[id]);
  const liveParts = useWorld((s) => s.parts);
  const outlineParts = useWorld((s) => s.outline?.parts ?? EMPTY_PARTS);
  const consoleState = useBoardConsole();
  const sourceRel =
    path && info?.source ? relFromWorldFile(path, info.source) : undefined;
  const text = transcriptText(consoleState.boards[id]?.entries ?? []);
  if (pending) {
    return (
      <p className="text-[12px] text-muted-foreground">Reading the world…</p>
    );
  }
  return (
    <>
      <Field label="Board" value={id} />
      <Field label="Chip" value={info?.chip ?? "—"} />
      <Field label="Firmware" value={info?.firmware ?? "—"} />
      <Field label="Source" value={info?.source ?? "None"} />
      <Field label="Status" value={boardStatusLabel(live, playing) || "—"} />
      <div className="mb-3 flex h-36 flex-col overflow-hidden rounded-md border border-border">
        <SerialConsole
          title={id}
          text={text}
          fault={live?.fault}
          notice={consoleState.rejects[id]}
          onNoticeClear={() => clearBoardReject(id)}
          onSend={(line) => sendBoardSerial(id, line)}
        />
      </div>
      <PinTable
        pins={pins}
        boardId={id}
        parts={outlineParts}
        live={liveParts}
      />
      <div className="text-[11px] text-muted-foreground">Source</div>
      <div className="mt-1 flex h-40 flex-col overflow-hidden rounded-md border border-border">
        {sourceRel ? (
          <SourceView path={sourceRel} />
        ) : (
          <p className="px-3 py-2 text-[12px] text-muted-foreground">
            This board has no source file.
          </p>
        )}
      </div>
    </>
  );
}

export function WorldInspector({
  canvasHeight,
  compact,
  width,
  cardRef,
}: {
  canvasHeight: number;
  compact: boolean;
  width: number;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  useWorldSelectionEsc();
  const selection = useWorld((s) => s.selection);
  const outline = useWorld((s) => s.outline);
  if (width <= 0) return null;

  const link =
    selection?.kind === "link"
      ? outline?.robots
          .find((robot) => robot.id === selection.robot)
          ?.links.find((item) => item.name === selection.link)
      : undefined;
  const board =
    selection?.kind === "board"
      ? outline?.boards.find((item) => item.id === selection.board)
      : undefined;
  const part =
    selection?.kind === "part"
      ? outline?.parts.find((item) => item.id === selection.part)
      : undefined;

  return (
    <aside
      ref={cardRef}
      className="pointer-events-auto absolute top-16 right-4 z-10 min-w-0 overflow-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg"
      style={{
        width: compact ? width : 260,
        maxWidth: compact ? "calc(100% - 1.5rem)" : undefined,
        maxHeight: overlayMaxHeight(canvasHeight),
      }}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">
          {selection ? "Selection" : "World"}
        </span>
        {selection ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => worldStore.getState().select(null)}
          >
            Clear
          </Button>
        ) : null}
      </header>
      {selection?.kind === "link" ? (
        <LinkBody
          robot={selection.robot}
          link={selection.link}
          info={link}
          pending={outline === null}
        />
      ) : selection?.kind === "board" ? (
        <BoardBody
          id={selection.board}
          info={board}
          pending={outline === null}
        />
      ) : selection?.kind === "part" ? (
        <PartBody id={selection.part} info={part} pending={outline === null} />
      ) : (
        <OutlineBody outline={outline} />
      )}
    </aside>
  );
}
