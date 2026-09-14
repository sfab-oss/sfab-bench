import { readFileSync } from "node:fs";

import { openCascade } from "./runtime";
import type { Embound, Label, OpenCascade, ShapeTool, ColorTool } from "./types";

/**
 * An XCAF document: the assembly graph OCCT builds from a STEP file, with the
 * product names, instance placements and colours still attached to it.
 */
export type StepDocument = {
  oc: OpenCascade;
  shapeTool: ShapeTool;
  colorTool: ColorTool;
  close(): void;
};

/** `char*` is unbound in this build; the pointer lives in the object's first word. */
function readAscii(oc: OpenCascade, str: Embound): string {
  return oc.UTF8ToString(oc.HEAPU32[str.$$.ptr >> 2]!);
}

/** Same for `char16_t*`, which also carries its length in the second word. */
function readExtended(oc: OpenCascade, str: Embound): string {
  const base = oc.HEAPU32[str.$$.ptr >> 2]!;
  const length = oc.HEAPU32[(str.$$.ptr >> 2) + 1]!;
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(oc.HEAPU16[(base >> 1) + i]!);
  return out;
}

/** The XCAF entry of a label, e.g. `0:1:1:5`. Unique inside one document. */
export function labelEntry(oc: OpenCascade, label: Label): string {
  const str = new oc.TCollection_AsciiString_1();
  oc.TDF_Tool.Entry(label, str);
  return readAscii(oc, str);
}

/** The product name STEP carried for this label, if it carried one. */
export function labelName(oc: OpenCascade, label: Label): string | null {
  const attribute = new oc.Handle_TDF_Attribute_1();
  if (!label.FindAttribute_1(oc.TDataStd_Name.GetID(), attribute)) return null;
  const name = new oc.Handle_TDataStd_Name_2(attribute.get());
  return readExtended(oc, name.get().Get()) || null;
}

/** Surface colour as `[r, g, b, a]` in 0..1, or null when the label carries none. */
export function labelColor(oc: OpenCascade, colorTool: ColorTool, label: Label): number[] | null {
  for (const type of [
    oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf,
    oc.XCAFDoc_ColorType.XCAFDoc_ColorGen,
  ]) {
    const color = new oc.Quantity_Color_1();
    // Which overload takes (label, type, colour) depends on the build; try both.
    for (const get of [colorTool.GetColor_4, colorTool.GetColor_1]) {
      try {
        if (get.call(colorTool, label, type, color)) {
          return [color.Red(), color.Green(), color.Blue(), 1];
        }
      } catch {
        /* wrong overload for this build */
      }
    }
  }
  return null;
}

export function childLabels(
  oc: OpenCascade,
  label: Label,
  keep: (child: Label) => boolean,
): Label[] {
  const out: Label[] = [];
  for (const it = new oc.TDF_ChildIterator_2(label, false); it.More(); it.Next()) {
    const child = it.Value();
    if (keep(child)) out.push(child);
  }
  return out;
}

/** The label a component instance points at, or null if the reference is broken. */
export function referredLabel(oc: OpenCascade, component: Label): Label | null {
  const referred = new oc.TDF_Label();
  return oc.XCAFDoc_ShapeTool.GetReferredShape(component, referred) ? referred : null;
}

/** A component's placement as a row-major 4x4, the layout `loadStepPackage` expects. */
export function componentMatrix(oc: OpenCascade, component: Label): number[] {
  const trsf = oc.XCAFDoc_ShapeTool.GetLocation(component).Transformation();
  const m = new Array<number>(16).fill(0);
  m[15] = 1;
  for (let row = 1; row <= 3; row += 1) {
    for (let col = 1; col <= 4; col += 1) m[(row - 1) * 4 + (col - 1)] = trsf.Value(row, col);
  }
  return m;
}

let sequence = 0;

/**
 * OCCT's path handling in this build takes a STEP path of at most ten characters:
 * eleven or more returns RetError from the root, and crashes the wasm instance from
 * a subdirectory. So the file is staged at the MEMFS root under a short rotating
 * name. Builds are serialised (see `buildStepPackage`), so ten names is plenty.
 */
function stagingName(): string {
  sequence = (sequence + 1) % 10;
  return `s${sequence}.step`; // 7 characters
}

/** Read a STEP file into a fresh XCAF document. Caller must `close()` it. */
export async function readStep(absPath: string): Promise<StepDocument> {
  const oc = await openCascade();
  const staged = stagingName();
  oc.FS.writeFile(staged, readFileSync(absPath));
  try {
    const document = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
    const handle = new oc.Handle_TDocStd_Document_2(document);
    const reader = new oc.STEPCAFControl_Reader_1();
    reader.SetColorMode(true);
    reader.SetNameMode(true);
    const status = reader.ReadFile(staged);
    if (status.value !== oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) {
      throw new Error(`STEP could not be read (status ${status.value})`);
    }
    if (!reader.Transfer_1(handle)) throw new Error("STEP carried no transferable shapes");
    const main = document.Main();
    return {
      oc,
      shapeTool: oc.XCAFDoc_DocumentTool.ShapeTool(main).get(),
      colorTool: oc.XCAFDoc_DocumentTool.ColorTool(main).get(),
      close: () => {
        try {
          oc.FS.unlink(staged);
        } catch {
          /* already gone */
        }
      },
    };
  } catch (err) {
    try {
      oc.FS.unlink(staged);
    } catch {
      /* already gone */
    }
    throw err;
  }
}
