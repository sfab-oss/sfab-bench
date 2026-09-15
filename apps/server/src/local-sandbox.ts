import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { Readable } from "node:stream";

import { APP_HOME } from "./config";

import type { HarnessV1NetworkSandboxSession, HarnessV1SandboxProvider } from "@ai-sdk/harness";
import type {
  Experimental_SandboxProcess,
  Experimental_SandboxSession,
} from "@ai-sdk/provider-utils";

const live = new Set<ChildProcess>();

function spawnShell(command: string, cwd: string, env?: NodeJS.ProcessEnv) {
  const child = spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  live.add(child);
  child.once("exit", () => live.delete(child));
  return child;
}

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function killAll() {
  for (const child of live) killTree(child);
}

let exitHandlers = false;
function installExitHandlers() {
  if (exitHandlers) return;
  exitHandlers = true;
  process.on("exit", killAll);
  process.once("SIGTERM", () => {
    killAll();
    process.exit(0);
  });
  process.once("SIGINT", () => {
    killAll();
    process.exit(0);
  });
}

function isInside(root: string, abs: string) {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function posixQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolvePath(root: string, p: string, extra: string[] = []) {
  const abs = normalize(isAbsolute(p) ? p : resolve(root, p));
  const home = homedir();
  const allowed = [
    root,
    ...extra,
    join(home, ".agents"),
    join(home, ".config", "opencode"),
    join(home, ".opencode"),
    join(home, ".local", "share", "opencode"),
    tmpdir(),
  ];
  if (allowed.some((dir) => isInside(dir, abs))) return abs;
  throw new Error(`sandbox path escapes workspace: ${p}`);
}

/**
 * Where adapters write `.harness-bootstrap/` and `.agent-runs/`.
 * Not the CAD folder — they still key that off `defaultWorkingDirectory`.
 * Remove when `workspace: localWorkspace({ path })` ships (vercel/ai#19108).
 */
export function harnessHome(root: string, appHome = APP_HOME): string {
  const id = createHash("sha256").update(normalize(root)).digest("hex").slice(0, 16);
  return join(appHome, "harness", id);
}

/** Spawn/run: coding commands in the open folder; bootstrap stays in the cache. */
export function projectCwd(root: string, workingDirectory?: string, stateDir?: string) {
  if (!workingDirectory) return root;
  const abs = resolvePath(root, workingDirectory, stateDir ? [stateDir] : []);
  return isInside(root, abs) ? root : abs;
}

const WORKDIR_FLAG = /--workdir\s+(?:'([^']*)'|"([^"]*)"|(\S+))/g;

/** Bridge `--workdir` must be the project, not `<harness>-<session>` under the cache. */
export function pinProjectWorkdir(command: string, root: string, stateDir?: string) {
  const project = normalize(root);
  const state = stateDir ? normalize(stateDir) : "";
  return command.replace(WORKDIR_FLAG, (full, single?: string, double?: string, bare?: string) => {
    const raw = single ?? double ?? bare ?? "";
    const abs = normalize(raw);
    if (abs === project) return full;
    if (isInside(project, abs) || (state && isInside(state, abs))) {
      return `--workdir ${posixQuote(project)}`;
    }
    return full;
  });
}

export function createLocalSandbox(root: string): HarnessV1SandboxProvider {
  installExitHandlers();
  return {
    specificationVersion: "harness-sandbox-v1",
    providerId: "local-host",
    createSession: async () => {
      const stateDir = harnessHome(root);
      await mkdir(stateDir, { recursive: true });
      return createLocalSession(root, stateDir);
    },
  };
}

function createLocalSession(root: string, stateDir: string): HarnessV1NetworkSandboxSession {
  const id = randomUUID();
  const children = new Set<ChildProcess>();
  const files: Experimental_SandboxSession = {
    description: `Local workspace at ${root}`,
    readFile: async ({ path }) => {
      try {
        return Readable.toWeb(createReadStream(resolvePath(root, path, [stateDir]))) as ReadableStream<Uint8Array>;
      } catch {
        return null;
      }
    },
    readBinaryFile: async ({ path }) => {
      try {
        return new Uint8Array(await readFile(resolvePath(root, path, [stateDir])));
      } catch {
        return null;
      }
    },
    readTextFile: async ({ path, encoding, startLine, endLine }) => {
      try {
        let text = await readFile(resolvePath(root, path, [stateDir]), {
          encoding: (encoding as BufferEncoding) ?? "utf8",
        });
        if (startLine != null || endLine != null) {
          const lines = text.split("\n");
          const start = Math.max(1, startLine ?? 1) - 1;
          const end = endLine ?? lines.length;
          text = lines.slice(start, end).join("\n");
        }
        return text;
      } catch {
        return null;
      }
    },
    writeFile: async ({ path, content }) => {
      const dest = resolvePath(root, path, [stateDir]);
      await mkdir(dirname(dest), { recursive: true });
      const chunks: Uint8Array[] = [];
      const reader = content.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      await writeFile(dest, Buffer.concat(chunks.map((c) => Buffer.from(c))));
    },
    writeBinaryFile: async ({ path, content }) => {
      const dest = resolvePath(root, path, [stateDir]);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content);
    },
    writeTextFile: async ({ path, content, encoding }) => {
      const dest = resolvePath(root, path, [stateDir]);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content, { encoding: (encoding as BufferEncoding) ?? "utf8" });
    },
    spawn: async ({ command, workingDirectory, env, abortSignal }) => {
      const cwd = projectCwd(root, workingDirectory, stateDir);
      const child = spawnShell(pinProjectWorkdir(command, root, stateDir), cwd, env);
      children.add(child);
      child.once("exit", () => children.delete(child));
      abortSignal?.addEventListener("abort", () => killTree(child), { once: true });
      const proc: Experimental_SandboxProcess = {
        pid: child.pid,
        stdout: Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
        stderr: Readable.toWeb(child.stderr!) as ReadableStream<Uint8Array>,
        wait: () =>
          new Promise((resolveWait) => {
            child.once("close", (code) => resolveWait({ exitCode: code ?? 1 }));
          }),
        kill: async () => {
          killTree(child);
        },
      };
      return proc;
    },
    run: async ({ command, workingDirectory, env, abortSignal }) => {
      const cwd = projectCwd(root, workingDirectory, stateDir);
      return new Promise((resolveRun) => {
        const child = spawnShell(pinProjectWorkdir(command, root, stateDir), cwd, env);
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout?.on("data", (d) => out.push(d as Buffer));
        child.stderr?.on("data", (d) => err.push(d as Buffer));
        abortSignal?.addEventListener("abort", () => killTree(child), { once: true });
        child.once("close", (code) => {
          resolveRun({
            exitCode: code ?? 1,
            stdout: Buffer.concat(out).toString("utf8"),
            stderr: Buffer.concat(err).toString("utf8"),
          });
        });
      });
    },
  };

  const session: HarnessV1NetworkSandboxSession = {
    id,
    defaultWorkingDirectory: stateDir,
    ports: [0],
    description: files.description,
    getPortEndpoint: async ({ port, protocol = "ws" }) => ({
      url: `${protocol}://127.0.0.1:${port}`,
    }),
    getPortUrl: async ({ port, protocol = "ws" }) => `${protocol}://127.0.0.1:${port}`,
    stop: async () => {
      for (const child of children) killTree(child);
    },
    destroy: async () => {
      for (const child of children) killTree(child);
    },
    restricted: () => files,
    readFile: files.readFile,
    readBinaryFile: files.readBinaryFile,
    readTextFile: files.readTextFile,
    writeFile: files.writeFile,
    writeBinaryFile: files.writeBinaryFile,
    writeTextFile: files.writeTextFile,
    spawn: files.spawn,
    run: files.run,
  };
  return session;
}


