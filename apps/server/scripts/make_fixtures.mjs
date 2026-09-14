#!/usr/bin/env node
/**
 * Writes apps/server/fixtures/*.step — the corpus the loader checks run against.
 *
 * These are generated rather than collected on purpose. A real STEP export mostly
 * exercises the happy path; what finds bugs is a file built to be awkward, and one
 * we wrote is also one we can state the right answer for. Every fixture here exists
 * because some invariant would be untested without it:
 *
 *   bracket_assembly  a sub-assembly, shared geometry, a colour on an instance
 *   curved_solids     a sphere's poles, a torus's seam, a cone's apex
 *   deep_nest         five levels of placement multiplied together
 *   bare_solids       no names, no colours: every fallback path
 *   many_instances    one solid placed 120 times, so dedup has to hold
 *   cut_solid         a boolean result, whose inner faces are REVERSED
 *
 * Regenerate with:  node apps/server/scripts/make_fixtures.mjs
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
const oc = await holder.exports({
  wasmBinary: readFileSync(join(dist, "opencascade.wasm.wasm")),
  print() {},
  printErr() {},
});

const outDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** A fresh XCAF document plus the helpers for filling one in. */
function doc() {
  const document = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  const handle = new oc.Handle_TDocStd_Document_2(document);
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()).get();
  const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(document.Main()).get();

  const name = (label, text) =>
    oc.TDataStd_Name.Set_1(label, new oc.TCollection_ExtendedString_2(text, true));

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

  const add = (shape, label) => {
    const added = shapeTool.AddShape(shape, false, true);
    if (label) name(added, label);
    return added;
  };

  const assembly = (label) => {
    const made = shapeTool.NewShape();
    if (label) name(made, label);
    return made;
  };

  const write = (file) => {
    shapeTool.UpdateAssemblies();
    const writer = new oc.STEPCAFControl_Writer_1();
    // Perform() writes one file. Transfer()+Write() takes a "multi" string here that
    // cannot be null, and a non-null one splits the assembly into a file per component.
    if (!writer.Perform_1(handle, new oc.TCollection_AsciiString_2("out.step"))) {
      throw new Error(`STEP write failed for ${file}`);
    }
    const bytes = Buffer.from(oc.FS.readFile("out.step"));
    writeFileSync(join(outDir, file), bytes);
    oc.FS.unlink("out.step");
    console.log(`wrote ${file} (${bytes.length} bytes)`);
  };

  return { shapeTool, name, color, at, add, assembly, write };
}

// A named, coloured assembly two levels deep, with one geometry instanced twice and
// one of those instances painted over its product's own colour.
{
  const d = doc();
  const plate = d.add(new oc.BRepPrimAPI_MakeBox_1(60, 40, 6).Shape(), "base_plate");
  d.color(plate, 0.31, 0.51, 0.71);
  const post = d.add(new oc.BRepPrimAPI_MakeCylinder_1(4, 18).Shape(), "post");
  d.color(post, 0.85, 0.42, 0.2);

  // A sub-assembly, so the tree the loader rebuilds is two levels deep and the leaf
  // transforms it emits are the product of two placements rather than one.
  const pair = d.assembly("post_pair");
  const left = d.shapeTool.AddComponent_1(pair, post, d.at(0, 0, 0));
  d.name(left, "post_left");
  // On the instance, not the product: this has to win over `post`'s own orange.
  d.color(left, 0.2, 0.7, 0.3);
  d.name(d.shapeTool.AddComponent_1(pair, post, d.at(36, 16, 0)), "post_right");

  const root = d.assembly("bracket_assembly");
  d.name(d.shapeTool.AddComponent_1(root, plate, d.at(0, 0, 0)), "plate_1");
  d.name(d.shapeTool.AddComponent_1(root, pair, d.at(12, 12, 6)), "posts");
  d.write("bracket_assembly.step");
}

// Curvature the tessellator has to close up by itself. A sphere's two poles are
// degenerate, a torus and a cylinder both carry a seam where u wraps, and a cone
// comes to a point. Any of those left open shows up as mesh volume disagreeing
// with the B-rep's, which is what the corpus check compares.
{
  const d = doc();
  const root = d.assembly("curved_solids");
  const parts = [
    ["ball", new oc.BRepPrimAPI_MakeSphere_1(10).Shape(), [0, 0, 0]],
    ["ring", new oc.BRepPrimAPI_MakeTorus_1(12, 3).Shape(), [40, 0, 0]],
    ["horn", new oc.BRepPrimAPI_MakeCone_1(8, 0, 20).Shape(), [80, 0, 0]],
    ["tube", new oc.BRepPrimAPI_MakeCylinder_1(6, 22).Shape(), [110, 0, 0]],
  ];
  for (const [label, shape, [x, y, z]] of parts) {
    const added = d.add(shape, label);
    d.name(d.shapeTool.AddComponent_1(root, added, d.at(x, y, z)), `${label}_1`);
  }
  d.write("curved_solids.step");
}

// Five levels of sub-assembly, each contributing one axis of a placement. The leaf
// has to land at the product of all five, which is the only thing that separates a
// correct transform composition from one that silently drops a level.
{
  const d = doc();
  const cube = d.add(new oc.BRepPrimAPI_MakeBox_1(4, 4, 4).Shape(), "cube");
  let inner = d.assembly("level_5");
  d.name(d.shapeTool.AddComponent_1(inner, cube, d.at(1, 0, 0)), "cube_1");
  const steps = [
    [0, 2, 0],
    [0, 0, 4],
    [8, 0, 0],
    [0, 16, 0],
  ];
  steps.forEach((offset, i) => {
    const outer = d.assembly(`level_${4 - i}`);
    d.name(d.shapeTool.AddComponent_1(outer, inner, d.at(...offset)), `level_${5 - i}_1`);
    inner = outer;
  });
  d.write("deep_nest.step");
}

// No names and no colours anywhere: the loader has to invent stable ids, and the
// viewer has to fall back to its default material without producing a null colour.
{
  const d = doc();
  const root = d.assembly(null);
  const a = d.add(new oc.BRepPrimAPI_MakeBox_1(10, 10, 10).Shape(), null);
  const b = d.add(new oc.BRepPrimAPI_MakeSphere_1(6).Shape(), null);
  d.shapeTool.AddComponent_1(root, a, d.at(0, 0, 0));
  d.shapeTool.AddComponent_1(root, b, d.at(30, 0, 0));
  d.write("bare_solids.step");
}

// A boolean result. Every fixture above is a BRepPrim primitive, and those come
// out with every face FORWARD — which left the branch in `mesh.ts` that flips a
// REVERSED face's winding completely untested. Cutting a hole through a plate
// gives four reversed faces out of seven, and getting them wrong turns the mesh
// inside out where it matters least visually and most for picking.
{
  const d = doc();
  const plate = new oc.BRepPrimAPI_MakeBox_1(30, 30, 12).Shape();
  const trsf = new oc.gp_Trsf_1();
  trsf.SetTranslation_1(new oc.gp_Vec_4(15, 15, -2));
  const drill = new oc.BRepBuilderAPI_Transform_2(
    new oc.BRepPrimAPI_MakeCylinder_1(6, 20).Shape(), trsf, true,
  ).Shape();
  const op = new oc.BRepAlgoAPI_Cut_3(plate, drill);
  op.Build();

  const root = d.assembly("cut_solid");
  const bored = d.add(op.Shape(), "bored_plate");
  d.color(bored, 0.45, 0.47, 0.5);
  d.name(d.shapeTool.AddComponent_1(root, bored, d.at(0, 0, 0)), "bored_plate_1");
  d.write("cut_solid.step");
}

// One solid placed 120 times. STEP hands these back as 120 separate products, so
// without content-hash dedup this is 120 components and 120 mesh downloads.
{
  const d = doc();
  const root = d.assembly("many_instances");
  const stud = d.add(new oc.BRepPrimAPI_MakeCylinder_1(2, 5).Shape(), "stud");
  d.color(stud, 0.6, 0.6, 0.62);
  for (let i = 0; i < 120; i += 1) {
    const col = i % 12;
    const row = (i - col) / 12;
    d.name(d.shapeTool.AddComponent_1(root, stud, d.at(col * 8, row * 8, 0)), `stud_${i + 1}`);
  }
  d.write("many_instances.step");
}
