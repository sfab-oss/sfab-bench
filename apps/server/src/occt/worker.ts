import { parentPort } from "node:worker_threads";

import { buildPackageHere } from "./package";
import { briefError, openCascade } from "./runtime";

/**
 * The tessellation thread. One job at a time, because the kernel behind it is a
 * single wasm instance; `occt/build.ts` is what guarantees that from the outside.
 *
 * Nothing else lives here on purpose. Everything this thread touches is either
 * wasm or the destination directory, so there is no shared state to get wrong and
 * killing it mid-job costs nothing but the half-written package the host removes.
 */
export type Job = { id: number; stepAbs: string; dest: string };
export type Done =
  | { id: number; ok: true; heapBytes: number }
  | { id: number; ok: false; error: string };

const port = parentPort;
if (port) {
  port.on("message", (job: Job) => {
    void buildPackageHere(job.stepAbs, job.dest)
      .then(async () => {
        const oc = await openCascade();
        port.postMessage({ id: job.id, ok: true, heapBytes: oc.HEAPU8.length } satisfies Done);
      })
      .catch((err: unknown) => {
        port.postMessage({
          id: job.id,
          ok: false,
          error: briefError(err),
        } satisfies Done);
      });
  });
}
