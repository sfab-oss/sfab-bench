# Open a project

A project is a directory on the Mac. Git is optional. The agent's cwd is
that directory. The folder is **this tab's** (`?project=`), the same way
`?file=` is this tab's document ([ADR 0006](../decisions/0006-folder-is-a-tab.md)).

`https://127.0.0.1:7322/` with no query is **Welcome**: recents and
**Open folder**. It does not open the last folder for you. A folder is
only in the tab after you pick one, or after you open a URL that already
names it.

On the Mac tab, pick a **recent** or **Open…**. The app window uses the
macOS folder chooser; the browser tab opens a small dialog (path, list,
Open / Cancel). **Close folder** returns to Welcome. Opening a new path
is loopback-only. A paired Quest picks from those recents; it cannot
name a new Mac path.

A folder with no `?file=` is an empty scene. Pick a recent STEP, or one
from Files. The last file is not opened automatically.

## Starting from scratch

This app visualizes CAD. It does not generate it.

- Already have STEP or GLB: **Open folder** and pick that directory.
- Nothing yet: clone
  [sfab-bench-starter](https://github.com/sfab-oss/sfab-bench-starter)
  (or Use this template), Open that folder in Bench, pick `cad/block.step`.
  The starter already has Jake's
  [CAD skill](https://github.com/earthtojake/text-to-cad) and a Bench
  skill under `.agents/skills`. Ask in chat for another part. cadgen is
  the Python runtime `$cad` installs, not a second skill
  (`python -m pip install -r .agents/skills/cad/requirements.txt` if
  authoring fails because it is missing).

The in-app agent only exists after a folder is open, so it cannot clone
the starter for you. If you opened some other empty folder, drop a STEP
or clone the starter instead of asking the agent to git clone.

Do not open the sfab-bench app repo as the project.

From a terminal:

```bash
pnpm cli open /abs/path --dev
```

That prints a Mac URL that already has `?project=`. Same for
`SFAB_BENCH_PROJECT=/abs/path pnpm dev`. Then open a STEP or GLB:

```
https://127.0.0.1:7322/?project=/abs/path/to/folder&file=cad/STEP/envelopes/box_envelope.step
```

`?file=` without `?project=` is ignored. Files anyone opened in that
folder show up under Recents for every client; opening one is a local
choice.

STEP is tessellated on demand by OpenCascade inside the server — no
Python, nothing to install. Cache is `~/.sfab-bench/cache/`; delete a
folder there to force a rebuild.
