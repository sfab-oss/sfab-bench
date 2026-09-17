#!/usr/bin/env node
/**
 * Fetch the real-world STEP corpus described by `fixtures/external.manifest.json`.
 *
 * None of these models are in the repo, and none of them ever should be: free to
 * download is not free to redistribute, and even where it is, a checkout that has
 * to reach the network to be complete is a checkout that can fail for reasons that
 * have nothing to do with the code. So the manifest is committed and the bytes are
 * not, and `fixtures/external/` is gitignored.
 *
 * What "safe" means here, concretely:
 *
 *  - https only, and only to hosts the manifest names, checked again *after*
 *    redirects so a redirect cannot walk us somewhere else
 *  - every download is hashed and compared to a sha256 recorded by hand, before
 *    a single byte lands in the destination
 *  - archives are unpacked with paths junked, so no entry can write outside the
 *    directory it was aimed at, however it is named inside the zip
 *  - nothing downloaded is ever executed, only parsed as STEP
 *
 * Usage:  pnpm corpus:fetch
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(fixtures, "external.manifest.json"), "utf8")
);
const dest = join(fixtures, "external");
const cache = join(dest, ".downloads");

const hosts = new Set(manifest.hosts);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Refuse anything that is not https to a host this manifest vouches for. */
function checkUrl(raw, why) {
  const url = new URL(raw);
  if (url.protocol !== "https:")
    throw new Error(`${why}: ${url.protocol} is not https`);
  if (!hosts.has(url.host))
    throw new Error(
      `${why}: ${url.host} is not one of ${[...hosts].join(", ")}`
    );
}

async function download(source) {
  checkUrl(source.url, source.id);
  const response = await fetch(source.url, { redirect: "follow" });
  if (!response.ok)
    throw new Error(`${source.id}: ${response.status} ${response.statusText}`);
  // Where we ended up, not where we aimed: a redirect chain gets the same scrutiny.
  checkUrl(response.url, `${source.id} redirected`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const got = sha256(bytes);
  if (got !== source.sha256) {
    throw new Error(
      `${source.id}: sha256 is ${got}, the manifest says ${source.sha256}. ` +
        `Nothing was written. Either the source changed — in which case look at what ` +
        `changed and update the manifest deliberately — or this is not the file it claims to be.`
    );
  }
  if (source.bytes && bytes.length !== source.bytes) {
    throw new Error(
      `${source.id}: ${bytes.length} bytes, the manifest says ${source.bytes}`
    );
  }
  return bytes;
}

/** Unpack `include` out of a zip with paths junked, so no entry escapes `into`. */
function unzipInto(archive, include, into) {
  const run = spawnSync(
    "unzip",
    ["-q", "-o", "-j", archive, include, "-d", into],
    { stdio: "inherit" }
  );
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`unzip exited ${run.status}`);
}

mkdirSync(cache, { recursive: true });
let fetched = 0;
let held = 0;

for (const source of manifest.sources) {
  // No terms, no download. This is the whole reason the manifest exists.
  if (!source.licence || !source.licenceUrl)
    throw new Error(`${source.id}: no licence recorded`);
  const stamp = join(cache, `${source.id}.sha256`);
  if (
    existsSync(stamp) &&
    readFileSync(stamp, "utf8").trim() === source.sha256
  ) {
    console.log(`  = ${source.id} (already here)`);
    held += 1;
    continue;
  }

  process.stdout.write(`  … ${source.id} `);
  const bytes = await download(source);

  if (source.kind === "zip") {
    const archive = join(cache, `${source.id}.zip`);
    writeFileSync(archive, bytes);
    unzipInto(archive, source.include, join(dest, source.id));
    rmSync(archive, { force: true });
  } else {
    const folder = join(dest, source.id);
    mkdirSync(folder, { recursive: true });
    const name = new URL(source.url).pathname.split("/").pop();
    // Written beside the target and moved into place, so an interrupted run never
    // leaves a half-written file looking like a verified one.
    const partial = join(cache, `${source.id}.part`);
    writeFileSync(partial, bytes);
    renameSync(partial, join(folder, name));
  }

  writeFileSync(stamp, source.sha256);
  fetched += 1;
  console.log(`ok — ${(bytes.length / 1048576).toFixed(1)}MB, ${source.short}`);
}

const models = readdirSync(dest, { recursive: true }).filter((f) =>
  /\.(step|stp)$/i.test(String(f))
);
console.log(
  `\n${fetched} fetched, ${held} already here — ${models.length} STEP files in fixtures/external/`
);
console.log(
  "Licences are recorded per source in fixtures/external.manifest.json. None of this is committed."
);
