# ADR-0001: New private repo, not sfab-cad

**Status:** Accepted
**Date:** 2026-09-13
**Deciders:** Alwurts

## Context

The CAD workbench seed lived in `sphere-robot/xr-viewer`. The product is
not a robot: it is a global server you point at any folder. That needs
its own repo, docs, and install path.

`sfab-oss/sfab-cad` already exists (private, last pushed 2026-07-28,
"AI-first code CAD (web + VR)"). Its architecture is the opposite of
this app: a cloud Worker with D1, R2 artifacts, a Cloudflare Containers
`cad-worker` running build123d, Godot for VR, and auth in `apps/web`.
Nothing in it is local-first and none of it uses the user's CLI logins.

## Decision

Start **clean** in a new private repo, `sfab-oss/sfab-bench`. Do not
merge `sfab-oss/sfab-cad`. Do not reuse that name for this architecture.

The first extract is this pnpm workspace (`apps/server`, `apps/web`,
`packages/contract`) copied from the working `xr-viewer` tree, including
pairing, the standalone Node server, the project model, and the shared
Mac + Quest session. `sphere-robot/xr-viewer` stays until this repo
actually runs; then that skill becomes a pointer.

The product name is **sfab-bench**. `npx` publish is later, not this
commit. The repo stays private until we choose otherwise.

## Consequences

### Positive
- Identity is the CAD workbench, not the robot.
- No Godot / Cloudflare / account stack to unwind.
- sphere-robot remains a directory you open.

### Negative
- Two trees until xr-viewer is deleted.
- Private GitHub means collaborators need org access.

### Mitigations
- Keep xr-viewer running until `pnpm dev` here is confirmed on Mac + Quest.
- Do not push sphere-robot as part of this extract.

## Implementation notes

Home and tessellation cache are `~/.sfab-bench/`. Env vars are
`SFAB_BENCH_*`. This repo does not default-open itself as a CAD project.

## Related

- [0002-step-loader-occt](0002-step-loader-occt.md)
- sphere-robot `docs/analysis/cad-app-product.md` (source of the plan)
