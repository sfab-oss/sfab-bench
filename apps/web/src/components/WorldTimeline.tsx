import type { TimelineMarker, TimelineTrack } from "@sfab-bench/contract";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  isMacPlatform,
  matchesShortcut,
  shortcutTooltip,
} from "@/lib/shortcuts";
import { sparkline, tracksForSelection } from "@/lib/timeline";
import { formatSimTime } from "@/lib/world-issues";
import { useWorld } from "@/state/world";
import { goLive, scrubTo, useWorldTimeline } from "@/state/world-timeline";

/**
 * Desktop scrub strip. Dragging moves this client's playhead only.
 * The shared run keeps its own sim time (D-015). Hidden in XR (D-008).
 */
export function WorldTimeline() {
  const { recording, data, playhead } = useWorldTimeline();
  const selection = useWorld((s) => s.selection);
  const outline = useWorld((s) => s.outline);
  const mac = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !matchesShortcut(event, "timeline-live", {
          mac,
          activeElement: document.activeElement,
        })
      ) {
        return;
      }
      event.preventDefault();
      goLive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mac]);

  if (!recording) return null;
  const from = recording.from;
  const to = Math.max(recording.to, from);
  const chosen = tracksForSelection(data?.tracks ?? [], selection, outline);
  const head = playhead ?? to;
  const span = Math.max(to - from, 1e-9);
  const headX = ((head - from) / span) * 100;
  const markers = (data?.markers ?? []).filter(
    (marker) => marker.kind !== "serial"
  );
  const live = playhead === null;

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex items-stretch gap-2 rounded-xl border border-border bg-card/95 p-1.5 shadow-lg">
      <div
        className="relative min-w-0 flex-1 cursor-ew-resize touch-none"
        role="slider"
        aria-label="Timeline"
        aria-valuemin={Math.round(from * 1000)}
        aria-valuemax={Math.round(to * 1000)}
        aria-valuenow={Math.round(head * 1000)}
        aria-valuetext={formatSimTime(head)}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          scrubTo(timeFromPointer(event, from, to));
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          scrubTo(timeFromPointer(event, from, to));
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-9 w-full"
          aria-hidden="true"
        >
          {chosen.primary ? (
            <Spark
              track={chosen.primary}
              from={from}
              to={to}
              field={chosen.primary.unit === "V" ? "lo" : "v"}
              className="stroke-foreground"
            />
          ) : null}
          {chosen.secondary ? (
            <Spark
              track={chosen.secondary}
              from={from}
              to={to}
              field="v"
              className="stroke-muted-foreground"
            />
          ) : null}
          {markers.map((marker) => (
            <Marker
              key={`${marker.kind}:${marker.board ?? ""}:${marker.t}`}
              marker={marker}
              from={from}
              span={span}
            />
          ))}
          <line
            x1={headX}
            x2={headX}
            y1="0"
            y2="100"
            className={live ? "stroke-foreground/40" : "stroke-brand"}
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex justify-between px-0.5 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatSimTime(from)}</span>
          <span className="truncate px-2">
            {trackLabel(chosen.primary)}
            {chosen.secondary ? ` · ${trackLabel(chosen.secondary)}` : ""}
          </span>
          <span>{formatSimTime(to)}</span>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={live ? "secondary" : "default"}
        className="h-9 shrink-0 self-center px-2.5"
        aria-pressed={live}
        title={shortcutTooltip("Return to live", "timeline-live", mac)}
        onClick={() => goLive()}
      >
        Live
      </Button>
    </div>
  );
}

function Spark({
  track,
  from,
  to,
  field,
  className,
}: {
  track: TimelineTrack;
  from: number;
  to: number;
  field: "v" | "lo";
  className: string;
}) {
  const d = sparkline(track, from, to, field);
  if (!d) return null;
  return (
    <path
      d={d}
      fill="none"
      className={className}
      strokeWidth="1.25"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function Marker({
  marker,
  from,
  span,
}: {
  marker: TimelineMarker;
  from: number;
  span: number;
}) {
  const x = ((marker.t - from) / span) * 100;
  const fault = marker.kind === "fault" || marker.kind === "reset";
  return (
    <line
      x1={x}
      x2={x}
      y1="8"
      y2="92"
      className={fault ? "stroke-destructive" : "stroke-muted-foreground"}
      strokeWidth="0.8"
      vectorEffect="non-scaling-stroke"
    >
      <title>
        {marker.kind}
        {marker.board ? ` ${marker.board}` : ""} {marker.t.toFixed(3)} s
      </title>
    </line>
  );
}

function trackLabel(track: TimelineTrack | null): string {
  if (!track) return "";
  const name = track.id.includes(":")
    ? track.id.slice(track.id.indexOf(":") + 1)
    : track.id;
  return `${name} (${track.unit})`;
}

function timeFromPointer(
  event: { clientX: number; currentTarget: Element },
  from: number,
  to: number
): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (!(rect.width > 0) || !(to > from)) return from;
  const u = Math.min(1, Math.max(0, x / rect.width));
  return from + u * (to - from);
}
