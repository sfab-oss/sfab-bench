# Open a project

A project is a directory on the Mac. Git is optional. The agent's cwd is
that directory.

On the Mac tab, click **Open folder**. Type a path (`~/…` works), pick a
recent, or browse. Opening a folder is loopback-only; a paired Quest
cannot change it.

From a terminal:

```bash
pnpm cli open /abs/path --dev
```

Then open a STEP or GLB from the file list. Paths in `?file=` are
relative to that folder:

```
https://127.0.0.1:7322/?file=cad/STEP/envelopes/box_envelope.step
```

No `?file=` is an empty scene. Files anyone opened show up under Recents
for every client; opening one is a local choice.

STEP is tessellated on demand (cadgen stopgap under
`~/.sfab-bench/tools/cadgen/`, or `cad/.cad-venv` inside the opened
folder). Cache is `~/.sfab-bench/cache/`.
