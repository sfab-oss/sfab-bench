# 2026-09-14 the OCCT WASM loader, and what this build does badly

STEP now opens through OpenCascade in-process ([ADR 0004](../decisions/0004-occt-via-opencascade-js.md)).
cadgen stays behind `SFAB_BENCH_LOADER=cadgen` until this has run for a while.

## It matches cadgen where it has to

Rebuilt every package in `~/.sfab-bench/cache` (13 files from sphere-robot,
1 part to 318 occurrences) and compared against what cadgen had written:

- **occurrence count: identical on all 13.**
- **component count: identical on all 13**, once components were keyed by mesh
  content hash rather than by XCAF definition label. Keying by label gave 318
  components where cadgen gave 46 — STEP hands you the same bolt as N separate
  products, and only content hashing collapses them again.
- bbox within 0.092 mm (mesh chord difference, not a structural one).
- face count per component identical on the part checked by hand, so
  `#o1.f37` means the same face it used to.

## Three sharp edges in opencascade.js@1.1.1

Each of these cost real time. They are commented at the call site; this is the
fuller version.

**1. Paths of 11+ characters fail.** `ReadFile("aaaaaa.step")` returns
`RetError`; `ReadFile("aaaaa.step")` works. Ten characters total, including the
extension, counted across the whole path — from a subdirectory an 11-character
path crashes the wasm instance outright rather than returning an error. The
loader stages every STEP at the MEMFS root as `s0.step`…`s9.step`. Absolute
paths fail the same way, which is what sent me looking.

**2. Strings only go in, not out.** `char*` and `char16_t*` are unbound, so
`TCollection_AsciiString::ToCString()` and `ExtendedString::Value()` both throw
`UnboundTypeError`. Both classes are `{pointer, length}` in memory, so
`readAscii` / `readExtended` in `document.ts` read the pointer out of the
object's first heap word and hand it to `UTF8ToString`. Without this there are
no part names.

**3. The module is neither CJS nor ESM.** `dist/opencascade.wasm.js` both calls
`require()` and ends in `export default`, which Node 22+ refuses to classify
(`ERR_AMBIGUOUS_MODULE_SYNTAX`). `runtime.ts` strips the ESM tail and runs the
rest as CommonJS text. Emscripten also takes the browser `fetch` path for the
wasm because Node has a global `fetch` now, so we pass `wasmBinary` directly
instead of letting it locate the file.

Smaller ones: overloads are suffixed by declaration order, so the argument
types decide which `GetColor_4` / `AddComponent_1` you want, and getting it
wrong throws a binding error naming the type it expected — which is the fastest
way to find the right one. `Transfer()` takes a "multi" string that cannot be
null, and a non-null one silently writes one file per component; `Perform()`
writes a single file, which is what the fixture generator uses.

## Shape of the walk

XCAF hands back a graph, the viewer wants a tree plus flat occurrences:

- Free labels under the shape tool are roots. One root becomes `o1`; several get
  a synthetic `o1` above them.
- Assembly labels recurse through their component children; each component
  carries a placement and points at a definition label.
- Only leaves get an occurrence, and it carries the **world** transform, not the
  parent-relative one. Intermediate nodes stay in the tree with no occurrence —
  that is what cadgen emitted, and `loadStepPackage` looks up an occurrence per
  node, so a missing one is just an identity group.
- Vertices are never shared between faces. That is what makes `.f7` refs
  possible at all, and it gives hard edges between faces while normals averaged
  inside a face keep cylinders smooth.

## Ownership, and why the heap still grows

embind gives you C++ objects with no finaliser in this build: anything a binding
returns **by value** is yours to `delete()`, and nothing does it for you. The
expensive one is not the document — it is `gp_Pnt::Transformed` in the vertex
loop, one allocation per vertex, about 67 MB per open on a 150k-triangle
assembly. The process bricked on the thirty-eighth STEP.

Three rules, learned the hard way:

- **A Handle refcounts its object.** `TDocStd_Document` and the
  `Handle_TDocStd_Document` wrapping it are not two things to free. Freeing both
  is a double free, and the process dies with SIGKILL and no message at all.
- **`TDF_ChildIterator` yields views, not copies.** Freeing a child label
  corrupts the iterator, and `More()` stops terminating. Only the iterator is
  yours.
- **A wasm heap never shrinks.** Even with every `delete()` in place, six opens
  of a 26 MB assembly settle at 860 MB: emscripten returns freed pages to its own
  allocator, not the OS, and OCCT fragments what it gets. Deleting more objects
  moves that number; it does not bound it.

So the bound is elsewhere. Above a watermark (`RECYCLE_ABOVE_BYTES` in
`runtime.ts`) the kernel is dropped and the next open instantiates a fresh one,
which costs about 350 ms. That is what makes the 2 GB ceiling unreachable
regardless of how complete the `delete()` audit is, and it is only safe because
`buildStepPackage` serialises builds — every raw pointer in flight belongs to the
one document it just closed.

## Still cadgen's

`.surf` and `.brep` sidecars. The viewer never fetches them (the route only
serves `assembly.json` and `components/*.tess`), so the OCCT packages do not
write them.
