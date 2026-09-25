import {
  jointTrackId,
  partTrackId,
  RECORD_FRAME_MS,
  supplyTrackId,
  type TimelineMarker,
  type TimelineTrack,
} from "@sfab-bench/contract";

import type { WorldOutline } from "@/lib/world-outline";
import type { WorldSelection } from "@/state/world";

/** Seconds at a pointer position along the strip. */
export function timeAtPointer(
  x: number,
  width: number,
  from: number,
  to: number
): number {
  if (!(width > 0) || !(to > from)) return from;
  const u = Math.min(1, Math.max(0, x / width));
  return from + u * (to - from);
}

/**
 * Seek time whose frame window contains `playhead`. The frame at that
 * boundary stores the 10 ms ending there, including a 1 ms dip inside it.
 * Clamped to the retained recording.
 */
export function seekTimeFor(
  playhead: number,
  from: number,
  to: number,
  frameMs = RECORD_FRAME_MS
): number {
  const step = Math.max(1, Math.round(frameMs));
  const covered = Math.ceil(Math.round(playhead * 1000) / step) * step;
  const lo = Math.round(from * 1000);
  const hi = Math.round(Math.max(to, from) * 1000);
  return Math.min(Math.max(covered, lo), hi) / 1000;
}

/** Board TX, and sent lines, at or before `t`. Markers are time-sorted. */
export function serialUntil(
  markers: readonly TimelineMarker[],
  board: string,
  t: number
): string {
  let text = "";
  for (const marker of markers) {
    if (marker.t > t) break;
    if (marker.kind !== "serial" || marker.board !== board) continue;
    text += marker.text ?? "";
  }
  return text;
}

export function resetsUntil(
  markers: readonly TimelineMarker[],
  board: string,
  t: number
): number {
  let count = 0;
  for (const marker of markers) {
    if (marker.t > t) break;
    if (marker.kind === "reset" && marker.board === board) count += 1;
  }
  return count;
}

/** Fault text at or before `t`. A later reload of that board clears it. */
export function faultUntil(
  markers: readonly TimelineMarker[],
  board: string,
  t: number
): string | undefined {
  let fault: string | undefined;
  for (const marker of markers) {
    if (marker.t > t) break;
    if (marker.board !== board) continue;
    if (marker.kind === "fault") fault = marker.text;
    if (marker.kind === "reload") fault = undefined;
  }
  return fault;
}

function byId(
  tracks: readonly TimelineTrack[],
  id: string
): TimelineTrack | null {
  return tracks.find((track) => track.id === id) ?? null;
}

function firstJoint(
  outline: WorldOutline | null
): { robot: string; joint: string } | null {
  if (!outline) return null;
  for (const robot of outline.robots) {
    for (const link of robot.links) {
      if (link.joint) return { robot: robot.id, joint: link.joint.name };
    }
  }
  return null;
}

function linkJoint(
  outline: WorldOutline | null,
  robotId: string,
  linkName: string
): string | null {
  const robot = outline?.robots.find((item) => item.id === robotId);
  const link = robot?.links.find((item) => item.name === linkName);
  return link?.joint?.name ?? null;
}

function supplyForBoard(
  outline: WorldOutline | null,
  board: string
): string | null {
  const supply = outline?.supplies.find((item) => item.boards.includes(board));
  return supply?.id ?? null;
}

/**
 * One track, or a joint plus its command when a part is selected.
 * Nothing selected uses the first joint.
 */
export function tracksForSelection(
  tracks: readonly TimelineTrack[],
  selection: WorldSelection,
  outline: WorldOutline | null
): { primary: TimelineTrack | null; secondary: TimelineTrack | null } {
  if (!selection) {
    const joint = firstJoint(outline);
    const id = joint ? jointTrackId(joint.robot, joint.joint) : "";
    return {
      primary:
        (id && byId(tracks, id)) ||
        tracks.find((t) => t.unit === "deg" && t.id.startsWith("joint:")) ||
        null,
      secondary: null,
    };
  }
  if (selection.kind === "link") {
    const name = linkJoint(outline, selection.robot, selection.link);
    const joint = name
      ? byId(tracks, jointTrackId(selection.robot, name))
      : null;
    return { primary: joint, secondary: null };
  }
  if (selection.kind === "part") {
    const drives = outline?.parts.find(
      (item) => item.id === selection.part
    )?.drives;
    const joint = drives
      ? byId(tracks, jointTrackId(drives.robot, drives.joint))
      : null;
    const command = byId(tracks, partTrackId(selection.part));
    if (joint) return { primary: joint, secondary: command };
    return { primary: command, secondary: null };
  }
  if (selection.kind === "supply") {
    return {
      primary: byId(tracks, supplyTrackId(selection.supply)),
      secondary: null,
    };
  }
  const supply = supplyForBoard(outline, selection.board);
  return {
    primary: supply ? byId(tracks, supplyTrackId(supply)) : null,
    secondary: null,
  };
}

/** SVG polyline in a 0..100 by 0..100 box. Null samples break the line. */
export function sparkline(
  track: TimelineTrack,
  from: number,
  to: number,
  field: "v" | "lo"
): string {
  const values = field === "lo" ? (track.lo ?? track.v) : track.v;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  const spanT = Math.max(to - from, 1e-9);
  const spanV = Math.max(max - min, 1e-9);
  let points = "";
  let pen = false;
  for (let i = 0; i < track.t.length; i++) {
    const t = track.t[i];
    const value = values[i];
    if (
      t === undefined ||
      value === null ||
      value === undefined ||
      !Number.isFinite(value)
    ) {
      pen = false;
      continue;
    }
    const x = ((t - from) / spanT) * 100;
    const y = 100 - ((value - min) / spanV) * 100;
    points += `${pen ? " " : "M "}${x.toFixed(2)} ${y.toFixed(2)}`;
    pen = true;
  }
  return points;
}
