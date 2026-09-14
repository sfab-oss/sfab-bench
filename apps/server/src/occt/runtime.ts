import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { OpenCascade } from "./types";

const require = createRequire(import.meta.url);

let pending: Promise<OpenCascade> | null = null;

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
      return oc;
    });
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
