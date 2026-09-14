# ADR-0002: STEP loader is own OpenCascade, not cadgen

**Status:** Accepted — implemented 2026-09-14 ([ADR 0004](0004-occt-via-opencascade-js.md))
**Date:** 2026-09-13
**Deciders:** Alwurts

## Context

Presence is a view package (`assembly.json` + `.tess`), not a raw STEP.
The tree, picker, measure, and TipTap chips need stable `#o…` occurrence
refs and face ordinals. Today that package is produced by Jake's cadgen
(`ensure_step_topology_artifact` + `mesh-export`).

Cadgen is a fine authoring kernel for a project's `cad/` tree. It is the
wrong long-term loader for a global CAD workbench: it pulls a Python
venv, Jake's artifact scheme, and a layout this product already rejected
as an adapter.

A mesh-only STEP import (typical `occt-import-js` / STL-style dumps)
would draw triangles and lose the refs. That is not a replacement.

## Decision

When we replace the loader, **build our own OpenCascade tessellator in
Node via WASM**. One function still: `package(stepAbs) → assembly.json +
.tess`. Same package contract the viewer already consumes, including
`#o…` refs and face ranges. The project never sees the kernel.

Cadgen (managed venv under `~/.sfab-bench/tools/cadgen/`, or a project's
`cad/.cad-venv` as a fast path) stays **only until that loader exists**.
It is not the destination.

## Consequences

### Positive
- Viewer contract stays stable while the kernel changes.
- Folders that are not cadgen projects can still open STEP later.

### Negative
- Python 3.12 is required until the WASM loader ships.
- Building a correct OCC tessellator with named occurrences is real work.

### Mitigations
- Do not add a second tessellator "for GLB-like STEP" beside cadgen.
- Do the OCCT loader when STEP must work without Python, or when cadgen
  is blocking a folder that is not a cadgen project — whichever comes first.

## Implementation notes

Shipped 2026-09-14 as `apps/server/src/occt/`, on the kernel chosen in
[ADR 0004](0004-occt-via-opencascade-js.md). The cadgen path
(`apps/server/src/loader.ts`, `apps/server/scripts/dump_step_package.py`)
stays reachable with `SFAB_BENCH_LOADER=cadgen` and is now the fallback, not
the default.

## Related

- [0004-occt-via-opencascade-js](0004-occt-via-opencascade-js.md) — which WASM binary
- [0001-new-private-repo](0001-new-private-repo.md)
- Not this: HOOPS / Autodesk / any hosted CAD SDK; a forever `pythonocc` install
