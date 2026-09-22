# Architecture

One Node process owns the STEP loader, the harness agents, and the
sqlite store under `~/.sfab-bench/`. The folder a request is about is
`?project=` ([ADR 0006](decisions/0006-folder-is-a-tab.md)). The Mac
browser tab and Quest Browser are both HTTPS clients of that process.
Product calls and ranked next: [`product.md`](product.md).

## Model

- **Server** is global. It does not live inside a CAD repo.
- **Project** = a directory on the Mac (git or not). Recorded as
  `{ path, lastFile, openedAt }`.
- **Document** = a STEP or GLB inside that directory, and a firmware
  image whose name ends in `.<chip>.bin`
  ([ADR 0008](decisions/0008-second-domain.md)). The catalog walk lists
  those images too. The suffix rule lives in `@sfab-bench/contract`
  (`firmwareChip`). Recursive walk, skipping
  `node_modules`, `.git`, and cache dirs.
- **Agent cwd** = the project directory. Skills and kernels belong to
  the folder, not to this app. Harness adapters keep `.harness-bootstrap`
  and session dirs under `~/.sfab-bench/harness/`, not in that folder.
- **Library** is shared: file recents, folder recents, thread list,
  messages at rest. The folder a tab is in is the tab's
  ([ADR 0006](decisions/0006-folder-is-a-tab.md),
  [ADR 0003](decisions/0003-library-not-viewport.md)).
- **Viewport is per browser:** loaded file, selection, camera, XR, which
  chat is open, live stream, and which experience the tab is showing
  (CAD or Device). `?file=` is the CAD document. `?device=` is the
  firmware image. One screen does not read the other.
  `show_artifact` moves only the asking client and appends recents.
- **The running device is one per document**, keyed by the project plus
  the image path ([ADR 0008](decisions/0008-second-domain.md)). Tabs and
  the agent tools share it. It is not one process-global slot, and it is
  not one machine per tab. The loader is esp-emu v0.43.0 on a worker
  thread (`apps/server/src/emu/`). The desktop `.app` does not carry that
  binary.

Chat turns are **prompt**, **fill**, or **idle** ([ADR 0007](decisions/0007-harness-chat-fill.md)).
A fill is a client tool result (`get_viewer`, `get_device`, `askUserQuestions`) into a
live unfinished harness session. `show_artifact` runs on the server in the
prompt stream and does not fill.

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
OpenCascade compiled to WASM: `apps/server/src/occt/` reads the STEP into
an XCAF document, walks the assembly for names, placements and colours,
tessellates each distinct solid once, and writes `assembly.json` +
`components/<hash>.tess` into `~/.sfab-bench/cache/`. No Python, no
subprocess ([ADR 0002](decisions/0002-step-loader-occt.md),
[ADR 0004](decisions/0004-occt-via-opencascade-js.md)).

It runs on a **worker thread**, not the API's. Reading and meshing are
long synchronous runs inside wasm — 25 seconds for a 26 MB assembly — and
on the server's own thread that is 25 seconds in which nothing else is
answered, including a paired headset's websocket. `occt/build.ts` owns the
worker and serialises jobs onto it; `occt/worker.ts` is the thread.

Two things follow from the thread rather than being arranged separately.
A file that sends the mesher into a pathological loop is killed on a
timeout instead of wedging the process for good. And the wasm heap, which
only ever grows, goes back to the OS when the thread ends — so recycling
above a watermark is just "start a new worker".

Components are keyed by **mesh content hash**, so the same solid placed
forty times is downloaded and uploaded once. Occurrences carry world
transforms; the tree carries the structure.

`source.json` records the source file's stamp and the package format
version. Occurrence ids and face ordinals are refs that leave the server,
so a cache from an older format is rebuilt rather than served with refs
that no longer mean what they did.
