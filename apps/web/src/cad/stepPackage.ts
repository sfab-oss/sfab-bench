/** cadgen view package (assembly.json). Units are millimetres, CAD Z-up. */

export type StepBBox = { min: [number, number, number]; max: [number, number, number] };

export type StepAssemblyNode = {
  id: string;
  name: string;
  nodeType: "part" | "assembly";
  children: StepAssemblyNode[];
  leafPartIds: string[];
};

export type StepOccurrence = {
  id: string;
  name: string;
  component: string;
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
