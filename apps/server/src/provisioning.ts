/**
 * First use of a harness installs its bridge into
 * `~/.sfab-bench/harness/shared/.harness-bootstrap/<id>/` with pnpm — about
 * twelve seconds, once per machine. Left to the agent, that install runs inside
 * the first turn, so a failure kills the turn instead of the send. This runs it
 * first, and reports why in one line.
 */

import { prepareHarnessSandboxTemplate } from "@ai-sdk/harness/agent";

import { HARNESS_LABEL, type HarnessId } from "@sfab-bench/contract";
import { harnessAdapter } from "./agent";
import { createLocalSandbox } from "./local-sandbox";

/** One line for the user. The command output goes to the server log. */
export function installFailureDetail(id: HarnessId, err: unknown): string {
  const label = HARNESS_LABEL[id];
  const message = err instanceof Error ? err.message : String(err);
  // Only the resolver/socket codes. A bare "network" substring matched things
  // that had nothing to do with reachability, so the line claimed the registry
  // was unreachable when it wasn't.
  const offline =
    /\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH)\b/.test(
      message
    );
  return offline
    ? `Could not install ${label} — no connection to the registry.`
    : `Could not install ${label}.`;
}

/** Only in-flight installs. "Installed" lives on disk, as the vendor's marker. */
const inflight = new Map<string, Promise<string | null>>();

/** First install is ~12s. Wide enough for a slow registry; not until restart. */
export const INSTALL_TIMEOUT_MS = 120_000;

class InstallTimeout extends Error {
  constructor() {
    super("install timed out");
    this.name = "InstallTimeout";
  }
}

function withTimeout(p: Promise<unknown>, ms: number): Promise<unknown> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new InstallTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** The result is discarded — only whether it settled matters. */
type Prepare = (root: string, id: HarnessId) => Promise<unknown>;

const defaultPrepare: Prepare = (root, id) =>
  prepareHarnessSandboxTemplate({
    harness: harnessAdapter(id),
    sandboxProvider: createLocalSandbox(root),
  });

/**
 * Resolves `null` once the harness is installed, or a reason why it isn't.
 * Concurrent sends join one install. Nothing is remembered afterwards: the
 * vendor's marker makes an installed harness a fast no-op, and a failed
 * install is simply tried again by the next send.
 */
export function ensureProvisioned(
  root: string,
  id: HarnessId,
  // The install itself, injectable so the self-check can drive the joining and
  // the forgetting without a twelve-second pnpm run.
  prepare: Prepare = defaultPrepare,
  timeoutMs = INSTALL_TIMEOUT_MS
): Promise<string | null> {
  // Keyed by harness alone: the bridge is installed once for the machine, so
  // two folders sending at the same time must join one install, not race it.
  const key = id;
  const running = inflight.get(key);
  if (running) return running;

  const run = withTimeout(prepare(root, id), timeoutMs)
    .then<string | null>(() => null)
    .catch<string | null>((err) => {
      console.error(`[provisioning] ${id} install failed`, err);
      if (err instanceof InstallTimeout) {
        return `Could not install ${HARNESS_LABEL[id]} — the install took too long.`;
      }
      return installFailureDetail(id, err);
    })
    .then((reason) => {
      inflight.delete(key);
      return reason;
    });

  inflight.set(key, run);
  return run;
}
