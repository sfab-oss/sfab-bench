# Open a project

A project is a directory on the Mac. Git is optional. The agent's cwd is
that directory. The folder is **this tab's** (`?project=`), the same way
`?file=` is this tab's document ([ADR 0006](../decisions/0006-folder-is-a-tab.md)).

On the Mac tab, pick a **recent**, **Choose folder…** (Electron), or browse
this Mac. Pasting a path is the fallback. Opening a new path is
loopback-only. A paired Quest picks from those recents; it cannot name a
new Mac path.

From a terminal:

```bash
pnpm cli open /abs/path --dev
```

Then open a STEP or GLB from the file list. Both query params are
relative to this tab:

```
https://127.0.0.1:7322/?project=/abs/path/to/folder&file=cad/STEP/envelopes/box_envelope.step
```

No `?file=` is an empty scene. Files anyone opened in that folder show
up under Recents for every client; opening one is a local choice.

STEP is tessellated on demand by OpenCascade inside the server — no
Python, nothing to install. Cache is `~/.sfab-bench/cache/`; delete a
folder there to force a rebuild.
