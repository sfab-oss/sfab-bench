# Architecture

One Node process owns the open folder, the STEP loader, the harness
agents, and the sqlite store under `~/.sfab-bench/`. The Mac browser tab
and Quest Browser are both HTTPS clients of that process. Product calls
and ranked next: [`product.md`](product.md).

## Model

- **Server** is global. It does not live inside a CAD repo.
- **Project** = a directory on the Mac (git or not). Recorded as
  `{ path, lastFile, openedAt }`.
- **Document** = a STEP or GLB inside that directory. Recursive walk,
  skipping `node_modules`, `.git`, and cache dirs.
- **Agent cwd** = the project directory. Skills and kernels belong to
  the folder, not to this app.
- **Library** is shared: open folder, file recents, folder recents,
  thread list, messages at rest. [ADR 0003](decisions/0003-library-not-viewport.md).
- **Viewport is per browser:** loaded file, selection, camera, XR, which
  chat is open, live stream. `show_artifact` moves only the asking client
  and appends recents.

Auth: loopback is trusted. Anything else on `/api` needs a paired device
token. Accounts and a public tunnel are later `principal.kind`s, not a
rewrite.

## Tree

`apps/server` is the process. `apps/web` is the Vite + R3F client.
`packages/contract` is the shared TypeScript for library snapshot, harness, and
viewer snapshot types.

Presence (the tessellated `assembly.json` + `.tess` package, the tree,
selection, measure, Quest world) is the product's identity relative to
a code workbench. Authoring is whatever produced the STEP.

## Loader

STEP → view package is a **loader**, not a project adapter. It is
OpenCascade compiled to WASM, running inside the API process:
`apps/server/src/occt/` reads the STEP into an XCAF document, walks the
assembly for names, placements and colours, tessellates each distinct
solid once, and writes `assembly.json` + `components/<hash>.tess` into
`~/.sfab-bench/cache/`. No Python, no subprocess
([ADR 0002](decisions/0002-step-loader-occt.md),
[ADR 0004](decisions/0004-occt-via-opencascade-js.md)).

Components are keyed by **mesh content hash**, so the same solid placed
forty times is downloaded and uploaded once. Occurrences carry world
transforms; the tree carries the structure.

cadgen remains reachable as `SFAB_BENCH_LOADER=cadgen` while the OCCT
path settles. `source.json` records which loader built a cached package,
so switching rebuilds rather than serving the other one's `#o…` refs.
