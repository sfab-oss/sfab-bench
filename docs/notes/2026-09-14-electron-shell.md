# 2026-09-14 the Electron shell, and four things that cost time

`pnpm desktop` runs the workbench in a window; `pnpm desktop:package` makes a
`.app` ([ADR 0005](../decisions/0005-electron-shell.md)). Both were verified
against sphere-robot: the packaged app tessellated
`yoke_v2_assembled.step` (381 occurrences, 115 components, 154k triangles) in
9.5 s with its own bundled OCCT kernel, then drew it.

## The certificate needs a session verifier, not an event

`app.on("certificate-error")` is the answer everyone reaches for, and it is
only half of one: it covers frame navigation. The page loaded, and then every
`components/*.tess` fetch died with `net_error -202` in the renderer — the
model sat at "Preparing model…" forever while the log filled with
`handshake failed`.

`session.setCertificateVerifyProc` is the hook that covers subresources too.
It has to be set **after** `app.whenReady()`; touching `session.defaultSession`
before that throws at module load, and in a packaged app that failure is
completely silent — the process stays up, no window, no output.

## The API runs in a utility process

Not in main. An 11 MB STEP is about ten seconds of wasm, and in the main
process that is ten seconds of frozen window. `utilityProcess.fork` gives the
same Node 24 (so `node:sqlite` is there) in a process of its own. ESM entry
points work.

## The bundle has to sit beside its node_modules

pnpm resolves through symlinks into a content-addressed store, so a bundle in
`apps/desktop/dist` cannot see the server's dependencies at all. The API bundle
is emitted into `apps/server/dist/api.mjs` instead, where resolution works.

Packaging sidesteps pnpm entirely: `package.mjs` stages an `app/` directory with
its own package.json listing the runtime dependencies and runs plain `npm
install` there, which produces the flat tree electron-builder expects. The cost
is that npm re-resolves those dependencies rather than reading the pnpm
lockfile, so a packaged build is not bit-identical to a dev one.

`asar: false`. The wasm kernel is read off disk by path and the utility process
forks a real file; an archive buys nothing here and hides everything.

## Single-instance lock will lie to you

`app.requestSingleInstanceLock()` means a stale instance makes every later
launch exit immediately, silently. Two separate "the server did not start"
investigations turned out to be an orphan from a previous run still holding the
lock and the port. `pkill -9 -f release/mac-arm64` before relaunching, and check
the port is actually free.

## Still open

Signing and notarisation. The build sets `identity: null`, so the app is
unsigned: right-click → Open the first time, per machine. Doing it properly
needs an Apple Developer identity and a decision about where notarisation
credentials live — a question for a human, not a default.
