"""Compile a STEP document and tessellate it for the viewer.

Usage:

  python dump_step_package.py /abs/part.step --dest /tmp/pkg

The live viewer calls this with --dest under ~/.sfab-bench/cache/.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

TESS = Path(__file__).resolve().parent / "tessellate_package.mjs"


def dump_package(step: Path, dest: Path) -> None:
    from cadgen.step_targets import ResolvedStepTarget
    from cadgen.step_topology_artifact import ensure_step_topology_artifact

    step = step.expanduser().resolve()
    dest = dest.expanduser().resolve()
    if not step.is_file():
        raise FileNotFoundError(step)

    target = ResolvedStepTarget(cad_path=str(step), source_path=step, step_path=step)
    art = ensure_step_topology_artifact(target, require_selector=True)
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(art.artifact_path, dest, dirs_exist_ok=True)
    (dest / "components").mkdir(exist_ok=True)

    proc = subprocess.run(["node", str(TESS), str(dest)], check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"tessellate failed (exit {proc.returncode})")


def _summarize(dest: Path) -> None:
    manifest = json.loads((dest / "assembly.json").read_text())
    occ = manifest.get("occurrences") or []
    comps = manifest.get("components") or {}
    root = (manifest.get("assembly") or {}).get("root") or {}
    print(f"wrote {dest}")
    print(
        f"kind={manifest.get('entryKind')} units={manifest.get('units')} "
        f"occ={len(occ)} components={len(comps)}"
    )
    print(f"root id={root.get('id')} name={root.get('name')}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("step", type=Path)
    parser.add_argument("--dest", type=Path, required=True, help="package directory to write")
    args = parser.parse_args(argv)

    step = args.step.expanduser().resolve()
    if not step.is_file():
        print(f"not a file: {step}", file=sys.stderr)
        return 1

    dest = args.dest.expanduser().resolve()
    try:
        dump_package(step, dest)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    _summarize(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
