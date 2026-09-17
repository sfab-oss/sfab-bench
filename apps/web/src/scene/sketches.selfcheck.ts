import { emptySnapshot, viewerStamp } from "@sfab-bench/contract";
import { Vector3 } from "three";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import {
  projectOnPlane,
  SKETCH_MAX_POINTS,
  SKETCH_MIN_STEP_M,
  type SketchStroke,
  shouldAppendPoint,
  shouldKeepStroke,
  strokeLengthM,
  toViewerSketch,
} from "@/scene/sketches";
import { store } from "@/state/store";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const empty = emptySnapshot("a.step");
expect(empty.sketches.length === 0, "empty snapshot has sketches []");
expect(
  viewerStamp(empty) === "[viewer] file=a.step empty",
  `empty stamp, got ${viewerStamp(empty)}`
);
expect(
  viewerStamp({
    ...empty,
    empty: false,
    selected: "#o1.f2",
    sketches: [
      {
        id: "s1",
        kind: "stroke",
        file: "a.step",
        on: "#o1.f2",
        mm: [
          [0, 0, 0],
          [10, 0, 0],
        ],
        lengthMm: 10,
      },
    ],
  }) === "[viewer] file=a.step selected=#o1.f2 sketches=1",
  "stamp names sketches"
);

const short: SketchStroke = {
  id: "s",
  file: "a.step",
  on: null,
  points: [
    [0, 0, 0],
    [0.001, 0, 0],
  ],
};
expect(strokeLengthM(short.points) === 0.001, "length metres");
expect(!shouldKeepStroke(short), "sub-2mm stroke is dropped");
expect(
  shouldKeepStroke({
    ...short,
    points: [
      [0, 0, 0],
      [0.01, 0, 0],
    ],
  }),
  "10mm stroke is kept"
);

expect(shouldAppendPoint([], [0, 0, 0]), "first point always appends");
expect(
  !shouldAppendPoint([[0, 0, 0]], [SKETCH_MIN_STEP_M / 2, 0, 0]),
  "closer than 4mm is skipped"
);
expect(
  shouldAppendPoint([[0, 0, 0]], [SKETCH_MIN_STEP_M, 0, 0]),
  "4mm step is kept"
);
const capped: [number, number, number][] = Array.from(
  { length: SKETCH_MAX_POINTS },
  (_, i) => [i * SKETCH_MIN_STEP_M, 0, 0]
);
expect(!shouldAppendPoint(capped, [10, 0, 0]), "200 points is the cap");

const mapped = toViewerSketch({
  id: "s1",
  file: "a.step",
  on: "#o1.f3",
  points: [
    [0.01, 0, 0],
    [0.02, 0, 0],
  ],
});
expect(mapped.kind === "stroke", "kind");
expect(mapped.mm[0]![0] === 10 && mapped.mm[1]![0] === 20, "metres → mm");
expect(mapped.lengthMm === 10, `lengthMm, got ${mapped.lengthMm}`);
expect(mapped.on === "#o1.f3", "face ref rides through");

const origin = new Vector3(0, 0, 0);
const normal = new Vector3(0, 1, 0);
const projected = projectOnPlane(new Vector3(1, 4, 2), origin, normal);
expect(
  projected.x === 1 && Math.abs(projected.y) < 1e-12 && projected.z === 2,
  "project onto XZ"
);

store.setState({
  url: "old.step",
  sketches: [],
  draft: null,
  review: null,
});
store.getState().beginSketch();
store.getState().appendSketchPoint([0, 0, 0]);
store.getState().appendSketchPoint([0.02, 0, 0]);
store.getState().commitSketch();
expect(store.getState().sketches.length === 1, "commit keeps a real stroke");
store.getState().beginSketch();
store.getState().appendSketchPoint([0, 0, 0]);
store.getState().commitSketch();
expect(store.getState().sketches.length === 1, "tiny draft is discarded");

// Same keys loadModel writes when swapping files; sketches must survive.
store.setState({
  url: "new.step",
  title: "new.step",
  progress: 0,
  error: null,
  review: null,
  selectedId: null,
  pickedRef: null,
  hiddenIds: new Set(),
  tool: "select",
  measure: { a: null, b: null },
  cameraMoved: false,
});
const ghost = viewerSnapshot();
expect(ghost.file === "new.step", "snapshot file is the open one");
expect(ghost.sketches.length === 1, "strokes persist after the file changes");
expect(ghost.sketches[0]!.file === "old.step", "each stroke stores file=");

store.getState().undoSketch();
expect(store.getState().sketches.length === 0, "undo last");
store.setState({
  sketches: [
    {
      id: "a",
      file: "old.step",
      on: null,
      points: [
        [0, 0, 0],
        [0.01, 0, 0],
      ],
    },
    {
      id: "b",
      file: "old.step",
      on: null,
      points: [
        [0, 0, 0],
        [0.01, 0, 0],
      ],
    },
  ],
});
store.getState().clearSketches();
expect(store.getState().sketches.length === 0, "clear all");

console.log("sketches.selfcheck ok");
