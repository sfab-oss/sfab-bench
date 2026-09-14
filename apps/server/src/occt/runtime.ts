import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { OpenCascade } from "./types";

const require = createRequire(import.meta.url);

let pending: Promise<OpenCascade> | null = null;
let current: OpenCascade | null = null;

/**
 * A wasm heap only ever grows: emscripten hands freed pages back to its own
 * allocator, never to the OS, and OCCT fragments what it gets. The ceiling is a
 * hard 2 GB, past which every call throws `memory access out of bounds` and the
 * instance is dead for the life of the process. Well below that we throw the
 * kernel away instead; a fresh one costs about 350ms, once.
 */
const RECYCLE_ABOVE_BYTES = 1280 * 1024 * 1024;

function distDir(): string {
  // No "exports" map in the package, so any subpath resolves.
  return join(dirname(require.resolve("opencascade.js/package.json")), "dist");
}

/**
 * opencascade.js ships one file that both `require()`s and ends in `export default`,
 * which Node 22+ refuses to classify. Strip the ESM tail and run the rest as CommonJS
 * text; pass the wasm bytes directly so emscripten never tries to fetch() a file path.
 */
function loadModule(): Promise<OpenCascade> {
  const dist = distDir();
  const src = readFileSync(join(dist, "opencascade.wasm.js"), "utf8").replace(
    /export default opencascade;\s*$/,
    "module.exports = opencascade;",
  );
  const holder: { exports: unknown } = { exports: {} };
  const factory = new Function("module", "exports", "require", "__dirname", "__filename", src);
  factory(holder, holder.exports, require, dist, join(dist, "opencascade.wasm.js"));
  const init = holder.exports as (opts: {
    wasmBinary: Buffer;
    print: (line: string) => void;
    printErr: (line: string) => void;
  }) => Promise<OpenCascade>;
  // OCCT chats on stdout (build banner, per-file transfer notes). Ours are the lines
  // that matter, so keep the kernel's behind SFAB_BENCH_OCCT_LOG=1.
  const chatty = process.env.SFAB_BENCH_OCCT_LOG === "1";
  const say = (line: string) => {
    if (chatty) console.log(`[occt] ${line}`);
  };
  return init({
    wasmBinary: readFileSync(join(dist, "opencascade.wasm.wasm")),
    print: say,
    printErr: say,
  });
}

/** The OpenCascade WASM kernel, instantiated once per process. */
export function openCascade(): Promise<OpenCascade> {
  if (!pending) {
    const started = Date.now();
    pending = loadModule().then((oc) => {
      console.log(`[occt] kernel ready in ${Date.now() - started}ms`);
      current = oc;
      return oc;
    });
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

/**
 * Drop the kernel if its heap has outgrown the watermark, so the next caller gets
 * a clean one. Only safe with no document open: callers hold raw wasm pointers,
 * and this invalidates all of them at once. `buildStepPackage` serialises builds,
 * so it calls this after closing its document and nowhere else.
 */
export function recycleLargeKernel(): void {
  if (!current || current.HEAPU8.length < RECYCLE_ABOVE_BYTES) return;
  const grown = Math.round(current.HEAPU8.length / 1048576);
  current = null;
  pending = null;
  console.log(`[occt] kernel heap reached ${grown}MB; starting a fresh one`);
}
