---
name: release
description: >
  Cut a GitHub Release of the sfab-bench Mac .app zip. Use when tagging,
  packaging with pnpm desktop:package, publishing vX.Y.Z, or the user
  says release, ship, or GitHub Releases. Not npm, not a cask, not
  notarisation unless they ask.
---

# Release

Ship is a **GitHub Release** on this private repo with one uploaded file:
`sfab-bench-<version>-arm64.app.zip` from `pnpm desktop:package`. Not
`npx`, not Homebrew. Notarisation is a human gate (Apple identity).

The GitHub **Assets** list must show **three** rows:

1. `sfab-bench-<version>-arm64.app.zip` (we upload this)
2. Source code (zip) (GitHub, from the tag)
3. Source code (tar.gz) (GitHub, from the tag)

Do not upload (2) or (3) yourself. They appear when **one** release
object is created against an existing tag. Two `gh release create`
calls for the same tag leave a **draft plus a published** release, and
a timeout/`HTTP 500` on a huge zip upload leaves the app zip missing.

## Do this, in order

Work from a clone on `main` that matches `origin/main`. Canonical
`repos/sfab-bench` stays on `main`; use a worktree if you need another
branch.

1. **Bump** `version` in every `package.json` (root, `apps/desktop`,
   `apps/web`, `apps/server`, `packages/contract`). The zip name comes
   from `apps/desktop/package.json`. Land the bump on `main` via PR.
   Do not push `main`.
2. **Package** from the monorepo root (several minutes, ~150 MB zip):

   ```bash
   pnpm desktop:package
   ```

   Output: `apps/desktop/release/mac-arm64/sfab-bench.app` and
   `apps/desktop/release/sfab-bench-<version>-arm64.app.zip`.
   Ad-hoc signed unless `CSC_NAME` / `CSC_LINK` is set. Do not start
   `pnpm dev` for this. If a stale packaged app is holding the lock,
   `pkill -9 -f release/mac-arm64` first.
3. **One tag, one release, zip in the same create.** Never `create`
   twice. Never create an empty release then upload as a workaround
   unless the create-with-zip already failed (see traps).

   ```bash
   git tag v<version>          # e.g. v0.2.0
   git push origin v<version>
   gh release create v<version> --repo sfab-oss/sfab-bench \
     --title v<version> --notes-file - \
     apps/desktop/release/sfab-bench-<version>-arm64.app.zip <<'EOF'
   <notes in product language, plus the Open Anyway / ⌘Q line>
   EOF
   ```

   The zip upload can take several minutes. Wait. Do not open a second
   `gh release create` while the first is running.
4. **Check the page**, not only `gh release view`. API `assets` only
   lists uploaded files (the `.app.zip`). The source zip/tar are
   `zipball_url` / `tarball_url`. On
   `https://github.com/sfab-oss/sfab-bench/releases/tag/v<version>`
   you must see all three rows. `gh release list` must show **one**
   `v<version>` line, not Draft + Latest.

## Traps

| Trap | What happens | Do this |
| --- | --- | --- |
| Two `gh release create` | Draft + published, same name | Delete the draft (`gh api -X DELETE repos/sfab-oss/sfab-bench/releases/<id>`). Keep the published one. |
| Create then `gh release upload` after a timeout | Zip missing or `HTTP 500`; UI may show only source archives, or later only the zip | Wait out one upload. Retry **upload** to the existing published id, do not create again. |
| Empty create so you can “give a link” | Source archives and the zip get out of sync in the UI | Do not publish until the zip is attached, unless the owner asked for the URL first. |
| `pnpm build` before package | Extra lint/test gate; `desktop:package` already builds web | Use `pnpm desktop:package` only. |
| Leave `package.json` at the old version | Zip is named `0.1.1` again | Bump first. |
| Kill `gh` mid-upload and create again | Second release / draft | Kill only if hung **and** `gh api .../releases/tags/vX.Y.Z` is still 404. |

## Notes copy

Short, product language. Include: unzip, drag to Applications, Open
Anyway, quit the old app with ⌘Q. See `docs/user/desktop.md`.

## After

Optional: one line on `docs/product.md` ship row. Smoke the zip: unzip,
Open Anyway, open a folder, open a STEP, one chat turn. Quest is
unchanged (`pnpm serve` / LAN :7322).
