import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

import { apiPort, DEV_API_HOST, publicPort } from "./config";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = fileURLToPath(new URL("../../web", import.meta.url));
const children: ChildProcess[] = [];
let shutting = false;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (shutting) return;
    shutdown();
    process.exit(code ?? 1);
  });
  return child;
}

function shutdown() {
  if (shutting) return;
  shutting = true;
  for (const child of children) child.kill("SIGTERM");
}

function waitForPort(port: number, host: string, ms: number) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host }, () => {
        sock.end();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > ms) reject(new Error(`API did not listen on ${host}:${port}`));
        else setTimeout(tryOnce, 50);
      });
    };
    tryOnce();
  });
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

run("pnpm", ["exec", "tsx", "--watch", "src/listen.ts"], serverRoot, {
  SFAB_BENCH_DEV: "1",
});

const port = apiPort();
await waitForPort(port, DEV_API_HOST, 15_000);
run("pnpm", ["exec", "vite", "--host"], webRoot);
console.log(
  `[dev] API http://${DEV_API_HOST}:${port}  Vite https://127.0.0.1:${publicPort()}`,
);
