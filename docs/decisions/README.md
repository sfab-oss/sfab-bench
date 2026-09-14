# Decisions (ADRs)

Architecture Decision Records for choices that are expensive to reverse.
Use [`template.md`](template.md) (SFab 4-digit). Prefer a short note in
`docs/notes/` until a decision needs this permanence.

| ADR | Call |
| --- | --- |
| [0001-new-private-repo](0001-new-private-repo.md) | New private repo; do not merge sfab-cad |
| [0002-step-loader-occt](0002-step-loader-occt.md) | Destination STEP loader is our own OpenCascade WASM tessellator |
| [0003-library-not-viewport](0003-library-not-viewport.md) | Share recents and thread history; keep each client's viewport independent |
| [0004-occt-via-opencascade-js](0004-occt-via-opencascade-js.md) | The OCCT kernel is prebuilt opencascade.js; the tessellator is ours |
| [0005-electron-shell](0005-electron-shell.md) | Electron is a shell around the same server and the same page |
