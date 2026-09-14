# ADR-0004: The OCCT kernel is prebuilt opencascade.js, not our own Emscripten build

**Status:** Accepted
**Date:** 2026-09-14
**Deciders:** Alwurts

## Context

[ADR-0002](0002-step-loader-occt.md) settled *what* the loader must be: our own
OpenCascade tessellator in Node via WASM, producing the same `assembly.json` +
`.tess` package, with `#o…` occurrence refs and face ordinals. It left *how* we
get an OCCT WASM binary open.

Two ways to get one:

1. Compile OCCT ourselves with Emscripten, exporting a narrow C++ surface.
2. Take a prebuilt full-API OCCT WASM off npm and write the tessellator in
   TypeScript against it.

Option 1 gives a small binary and a surface we control, at the cost of a Docker
toolchain, a multi-hour build, and a C++ layer to maintain for a two-person
repo. Option 2 puts the whole XCAF API — product names, instance placements,
colours, `BRepMesh` — in reach today, at the cost of a 66 MB dependency and
someone else's binding choices.

## Decision

Use **`opencascade.js@1.1.1`** as the kernel. The loader — label walk,
instancing, mesh extraction, face ordinals, package writing — is ours, in
TypeScript, under `apps/server/src/occt/`. The kernel is a dependency we call,
not a fork we maintain.

This does not reopen ADR-0002. The package contract, the `#o…` refs, and "the
project never sees the kernel" all hold. Only the source of the binary is
settled here.

## Consequences

### Positive
- Full XCAF today: `STEPCAFControl_Reader` gives the assembly graph with names,
  colours and per-instance placements, so the tree the viewer draws is the tree
  the STEP author wrote.
- No Python. STEP opens in a folder that has never had a CAD toolchain in it.
- Cold tessellation got faster: ~0.3 s for a part, ~1.3 s for a 22-part
  assembly, ~12 s for an 11 MB / 318-occurrence one, then cached.
- The kernel is one wasm instance in the API process. No subprocess, no venv,
  no `~/.sfab-bench/tools/`.

### Negative
- 66 MB of wasm in `node_modules`, and it has to survive Electron packaging.
- The build is old (2021) and its embind surface has sharp edges — see the
  working note. Three of them cost real debugging time.
- `opencascade.js` is a one-maintainer project. If it goes stale we inherit
  option 1 after all.

### Mitigations
- Everything quirky is isolated in `occt/runtime.ts` and `occt/document.ts`
  behind named helpers, with the reason in a comment. Swapping the binary means
  editing those two files, not the tessellator.
- `occt.selfcheck.ts` builds a committed fixture and asserts the package
  invariants the viewer depends on, including that normals point outward.

## Implementation notes

- `occt/runtime.ts` — loads the wasm once per process.
- `occt/document.ts` — STEP → XCAF document, and the label/name/colour helpers.
- `occt/mesh.ts` — one shape → positions, normals, face ordinals, face ranges.
- `occt/package.ts` — the walk, content-hash instancing, and the package write.
- `cad-pkg.ts` picks the loader and records it in `source.json` so switching
  rebuilds instead of serving another loader's refs.

## Related

- [0002-step-loader-occt](0002-step-loader-occt.md) — the decision this implements
- [`docs/notes/2026-09-14-occt-loader.md`](../notes/2026-09-14-occt-loader.md) — the build's sharp edges
- Not this: HOOPS / Autodesk / any hosted CAD SDK; `occt-import-js` (mesh only, no refs)
