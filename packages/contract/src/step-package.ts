/**
 * The view package a STEP loader produces and the viewer consumes: one
 * `assembly.json` plus one `components/<id>.tess` per distinct geometry.
 * Units are millimetres, CAD Z-up. Written by `apps/server/src/occt`,
 * read by `apps/web/src/cad/loadStepPackage.ts`.
 */

export type StepBBox = {
  min: [number, number, number];
  max: [number, number, number];
};

export type StepAssemblyNode = {
  id: string;
  name: string;
  nodeType: "part" | "assembly";
  children: StepAssemblyNode[];
  /** Every part id at or below this node, for tree selection. */
  leafPartIds: string[];
};

export type StepOccurrence = {
  /** Occurrence path, e.g. `o1.3.2`. `#o1.3.2` is the ref an agent sees. */
  id: string;
  name: string;
  /** Key into `components`. Several occurrences share one component. */
  component: string;
  /** Row-major 4x4, already flattened to world. */
  transform: number[];
  color?: number[];
};

export type StepComponent = {
  surf?: string;
  brep?: string;
  contentHash?: string;
};

export type StepPackage = {
  entryKind: "part" | "assembly";
  units: string;
  label?: string;
  bbox?: StepBBox;
  assembly?: { root: StepAssemblyNode };
  occurrences: StepOccurrence[];
  components: Record<string, StepComponent>;
};
