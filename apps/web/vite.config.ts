import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import { defineConfig } from "vite";

import { apiPort, certDir, DEV_API_HOST } from "@sfab-bench/server/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const apiTarget = `http://${DEV_API_HOST}:${apiPort()}`;

/** Forward the browser's address. Without this, the API would see 127.0.0.1 for every client. */
function apiProxy() {
  return {
    "/api": {
      target: apiTarget,
      changeOrigin: false,
      ws: true,
      timeout: 0,
      proxyTimeout: 0,
      xfwd: false,
      configure(proxy: {
        on: (
          event: "proxyReq" | "proxyReqWs",
          fn: (proxyReq: { setHeader: (name: string, value: string) => void }, req: IncomingMessage) => void,
        ) => void;
      }) {
        const setXff = (proxyReq: { setHeader: (name: string, value: string) => void }, req: IncomingMessage) => {
          const addr = req.socket.remoteAddress;
          if (addr) proxyReq.setHeader("x-forwarded-for", addr);
        };
        proxy.on("proxyReq", setXff);
        proxy.on("proxyReqWs", setXff);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl({ certDir: certDir() })],
  resolve: {
    dedupe: ["three"],
    alias: {
      "@": srcDir,
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: apiProxy(),
  },
  preview: {
    host: true,
    port: 5173,
    proxy: apiProxy(),
  },
});
