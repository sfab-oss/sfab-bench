#!/usr/bin/env node
/**
 * Writes apps/server/fixtures/bracket_assembly.step: a tiny named, coloured assembly
 * with one geometry instanced twice, so the loader self-check has something with a
 * tree, colours, transforms and a shared component in it. Regenerate with:
 *
 *   node apps/server/scripts/make_fixture_step.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("opencascade.js/package.json")), "dist");
const src = readFileSync(join(dist, "opencascade.wasm.js"), "utf8").replace(
  /export default opencascade;\s*$/,
  "module.exports = opencascade;",
);
const holder = { exports: {} };
new Function("module", "exports", "require", "__dirname", "__filename", src)(
  holder, holder.exports, require, dist, join(dist, "opencascade.wasm.js"),
);
const oc = await holder.exports({ wasmBinary: readFileSync(join(dist, "opencascade.wasm.wasm")) });

const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
const handle = new oc.Handle_TDocStd_Document_2(doc);
const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(doc.Main()).get();

const name = (label, text) => oc.TDataStd_Name.Set_1(label, new oc.TCollection_ExtendedString_2(text, true));
const color = (label, r, g, b) => {
  const value = new oc.Quantity_Color_3(r, g, b, oc.Quantity_TypeOfColor.Quantity_TOC_RGB);
  // Which SetColor overload takes a raw colour varies by build.
  for (let n = 1; n <= 6; n += 1) {
    const set = colorTool[`SetColor_${n}`];
    if (!set) continue;
    try {
      set.call(colorTool, label, value, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
      return;
    } catch {
      /* next overload */
    }
  }
  throw new Error("no SetColor overload accepted a Quantity_Color");
};
const at = (x, y, z) => {
  const trsf = new oc.gp_Trsf_1();
  trsf.SetTranslation_1(new oc.gp_Vec_4(x, y, z));
  return new oc.TopLoc_Location_2(trsf);
};

const plate = shapeTool.AddShape(new oc.BRepPrimAPI_MakeBox_1(60, 40, 6).Shape(), false, true);
name(plate, "base_plate");
color(plate, 0.31, 0.51, 0.71);

const post = shapeTool.AddShape(new oc.BRepPrimAPI_MakeCylinder_1(4, 18).Shape(), false, true);
name(post, "post");
color(post, 0.85, 0.42, 0.2);

const assembly = shapeTool.NewShape();
name(assembly, "bracket_assembly");
name(shapeTool.AddComponent_1(assembly, plate, at(0, 0, 0)), "plate_1");
name(shapeTool.AddComponent_1(assembly, post, at(12, 12, 6)), "post_left");
name(shapeTool.AddComponent_1(assembly, post, at(48, 28, 6)), "post_right");
shapeTool.UpdateAssemblies();

const writer = new oc.STEPCAFControl_Writer_1();
// Perform() writes one file. Transfer()+Write() takes a "multi" string here that
// cannot be null, and a non-null one splits the assembly into a file per component.
if (!writer.Perform_1(handle, new oc.TCollection_AsciiString_2("fixture.step"))) {
  throw new Error("STEP write failed");
}
const out = join(fileURLToPath(new URL("../fixtures/", import.meta.url)), "bracket_assembly.step");
writeFileSync(out, Buffer.from(oc.FS.readFile("fixture.step")));
console.log(`wrote ${out} (${oc.FS.stat("fixture.step").size} bytes)`);
