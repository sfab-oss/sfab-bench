import {
  EyeOff,
  MousePointer2,
  Pencil,
  Ruler,
} from "@react-three/uikit-lucide";

import type { Tool } from "@/state/store";

export type { Tool };

export const TOOLS: { id: Tool; Icon: typeof Ruler; label: string }[] = [
  { id: "select", Icon: MousePointer2, label: "Select" },
  { id: "measure", Icon: Ruler, label: "Measure" },
  { id: "hide", Icon: EyeOff, label: "Hide" },
  { id: "sketch", Icon: Pencil, label: "Sketch" },
];
