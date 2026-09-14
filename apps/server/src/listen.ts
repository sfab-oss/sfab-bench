import { getCertificate } from "@vitejs/plugin-basic-ssl";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { fileURLToPath } from "node:url";

import { resetAgents } from "./agent";
import { resetChatSessions } from "./chat";
import { apiPort, certDir, DEV_API_HOST, publicPort } from "./config";
import { handleRequest } from "./http";
import { bootProject, subscribeProjectChange } from "./projects";
import { hydrateSession } from "./session";
import { printJoinBanner } from "./join-banner";
import { tryUpgradeSession } from "./ws";

const isDev = process.env.SFAB_BENCH_DEV === "1";
const dist = fileURLToPath(new URL("../../web/dist", import.meta.url));

function onError(err: unknown, res: { headersSent: boolean; statusCode: number; end: (body?: string) => void }) {
  console.error("[api]", err);
  if (res.headersSent) return;
  res.statusCode = 500;
  res.end(err instanceof Error ? err.message : String(err));
}

async function main() {
  subscribeProjectChange(() => {
    resetAgents();
    resetChatSessions();
    hydrateSession();
  });
  bootProject();
  hydrateSession();
  if (isDev) {
    const port = apiPort();
    const server = createHttpServer((req, res) => {
      void handleRequest(req, res).catch((err) => onError(err, res));
    });
    server.on("upgrade", (req, socket, head) => {
      if (!tryUpgradeSession(req, socket, head)) socket.destroy();
    });
    server.requestTimeout = 0;
    server.listen(port, DEV_API_HOST, () => {
      console.log(`[api] http://${DEV_API_HOST}:${port} (dev, loopback only; Vite proxies /api)`);
    });
    return;
  }

  const port = publicPort();
  const pem = await getCertificate(certDir());
  const server = createHttpsServer({ key: pem, cert: pem }, (req, res) => {
    void handleRequest(req, res, { staticRoot: dist }).catch((err) => onError(err, res));
  });
  server.on("upgrade", (req, socket, head) => {
    if (!tryUpgradeSession(req, socket, head)) socket.destroy();
  });
  server.requestTimeout = 0;
    server.listen(port, "0.0.0.0", () => {
      printJoinBanner("serve");
    });
}

void main();
