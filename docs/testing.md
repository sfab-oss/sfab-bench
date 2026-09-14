# Testing

What "renders correctly" means here, and which parts of it are checked today.

Checks are plain `tsx` scripts named `*.selfcheck.ts`, run by `pnpm test`.
No framework. A check either prints `… ok` or throws.

## The ladder

"Correct" has several different reference points, and it is worth being
explicit about which one a given check is using. Each tier below has a
different **oracle** — the thing that knows the right answer.

| Tier | Oracle | Catches |
| --- | --- | --- |
| 0 Admissibility | the process | crashes, hangs, runaway memory, non-determinism |
| 1 Self-consistency | the package's own invariants | anything malformed, on **any** model |
| 2 Fidelity | the exact B-rep | dropped faces, reversed winding, wrong transforms, wrong units |
| 3 Metamorphic | a second run | regressions, without goldens |
| 4 Render | scene graph, then pixels | scale, up-axis, colour, pick refs |
| 5 VR | eye matrices, room scale | 1:1 size, spawn placement, stereo, frame budget |

The tiers that need no reference model are the valuable ones, because a
file nobody has ever looked at is still a test case for them. **A golden
package only tells you about the one model it was captured from, and goes
stale the moment the tessellator legitimately changes.** Prefer an
invariant to a golden every time one is available.

## Built

**Tier 0–1 — `occt/invariants.ts`, run by `occt.corpus.selfcheck.ts`.**
`checkPackage(dir)` reads a built package back off disk and returns every
way it contradicts itself: a tree leaf with no occurrence, a component key
with no `.tess`, a `.tess` with no component, indices past the end of the
vertex array, non-unit normals, normals that disagree with their triangle's
winding, face ranges that do not tile the index buffer with dense 1-based
ordinals, a non-affine transform, a colour outside 0..1, a declared bbox
the geometry sticks out of. Determinism — the same STEP built twice in one
process giving a byte-identical package — is in `occt.selfcheck.ts`.

The `.tess` reader in `invariants.ts` is a deliberate second implementation
of the one in `apps/web/src/cad/decodeTess.ts`. An encoder checked by its
own inverse agrees with itself no matter what it writes.

Tessellation runs on a worker thread, so these checks exercise the same
path the server does, including the job timeout and the heap-watermark
retirement. Both of those were mutation-tested by shrinking their
constants until they fired.

**Tier 2 — `occt/solid.ts`.** `solidProps` measures volume, area, centre of
mass and bounding box from the exact B-rep; `meshProps` measures the same
four from the triangles, by the divergence theorem. The corpus check
compares them per solid.

This is the strongest geometric oracle available, because it needs no
reference file and no second kernel:

- a face dropped or a seam left open → mesh volume falls short
- winding reversed → **signed** mesh volume comes back negative
- a transform applied twice or not at all → the box moves
- a unit misread → everything is out by 25.4 or 1000

Tolerances are 2% on volume and area: tessellation is a chord
approximation so the numbers never match exactly, but a real defect misses
by tens of percent, never by tenths.

## The corpus

`apps/server/fixtures/*.step`, written by
`node apps/server/scripts/make_fixtures.mjs`. **Generated, not collected**,
and deliberately not pointed at anyone's CAD folder — the checks have to
pass on a clean clone.

Generated beats collected here for two reasons. A real export mostly
exercises the happy path, whereas a file built to be awkward is where bugs
are. And a file we wrote is one we can state the right answer for.

Every fixture exists because some invariant would otherwise be untested:

| Fixture | Covers |
| --- | --- |
| `bracket_assembly` | a sub-assembly, shared geometry, a colour on an instance beating the product's |
| `curved_solids` | a sphere's degenerate poles, a torus's seam, a cone's apex |
| `cut_solid` | a boolean result, whose inner faces are `REVERSED` |
| `deep_nest` | five levels of placement multiplied together |
| `bare_solids` | no names, no colours — every fallback path |
| `many_instances` | one solid placed 120 times, so content-hash dedup has to hold |
| `inch_block` | a file whose declared length unit is not millimetres |

Adding a STEP to `fixtures/` adds a test: the corpus check sweeps the
directory.

`cut_solid` is there because of a mutation test. Every other fixture is a
`BRepPrimAPI` primitive, and those come out with every face `FORWARD`,
which left the branch in `mesh.ts` that flips a `REVERSED` face's winding
entirely untested — deleting it changed nothing. With a boolean cut in the
corpus, deleting it fails by 19.2%.

`inch_block` settles a question rather than guarding a known behaviour.
`loadStepPackage.ts` scales by a hardcoded `0.001` and never reads the
package's `units`, which is only correct if OCCT converts non-millimetre
files on the way in. It does: a 2 x 1 x 0.5 **inch** block reads back as
50.8 x 25.4 x 12.7 mm. That conversion is now load-bearing and asserted,
because without it every inch-authored STEP would draw 25.4x too small.

The fixture is written in millimetres and then has its unit declaration
rewritten as text, because this OCCT build does not expose the
`write.step.unit` static — `SetCVal` returns false and the writer emits
millimetres regardless.

**If you add a check, mutate the code it covers and confirm it fails.** A
check that passes against a broken tessellator is worse than no check,
because it is also a claim.

## Not built yet

Roughly in the order worth doing.

**Tier 4a — scene graph.** three.js assembles a scene and raycasts against
it in plain Node, with no GPU and no jsdom, so this is cheap and
deterministic. Worth asserting: the loaded root's world bbox **in metres**;
CAD Z mapping to three Y;
`sitHeight` putting the model on the floor; and above all that a ray from a
fixed direction returns the **expected `#o1.2.f7`**. That ref is what
`get_viewer` hands an assistant, which then acts on it, so a ref that
quietly shifts is a product bug, not a viewer detail.

**Tier 5a — placement.** `placeAtGaze` and `faceToward` in
`scene/SpawnInFront.tsx` are already exported and pure. Feed them a
synthetic camera pose and assert the result. No headset needed.

**Tier 4b — pixels.** Not image diffs; GPU and driver variation makes exact
comparison worthless. Structural metrics from a few canonical views:
coverage fraction, screen-space centroid, and the pixel colour at each
part's projected centroid. Plus one reference-free normals test: render
once forcing `FrontSide` and once `DoubleSide` — for a closed solid the
coverage must match. Note that CAD materials ship as `DoubleSide`, so the
product currently **hides** winding errors; that config has to be forced.

**Tier 5b — stereo and budget.** Render from both eye matrices and check a
part appears in both with horizontal disparity of the right sign for its
depth; inverted eyes are nauseating and completely invisible on a monitor.
Assert draw calls and triangle counts in CI (deterministic); record real
frame times on-device as a tracked number rather than a pass/fail.

## On external models

Free-to-download is not free-to-redistribute. GrabCAD, TraceParts,
McMaster-Carr, SnapEDA and most vendor part libraries let you download and
use a model without granting you the right to ship it in a repo, and on
user-upload sites the provenance is unreliable besides.

If a real-world corpus is ever wanted, the clean shape is a manifest of
URL + sha256 + licence, a fetch step into an ignored directory, and only
the *derived expectations* committed. Sources that are actually permissive:
NIST's MBE PMI test suite (US Government work, published for exactly this),
the CAx-IF interoperability models, OCCT's own `data/step/`, FreeCAD's test
files, KiCad's `packages3D`.

That does not exist today, and the generated corpus is not blocked on it.
