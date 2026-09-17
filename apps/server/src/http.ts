import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";

import { app } from "./app";
import { tryServeStatic } from "./static";

function pathOf(req: IncomingMessage) {
  return (req.url ?? "").split("?")[0];
}

const honoListener = getRequestListener(app.fetch);

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { staticRoot?: string } = {}
) {
  const path = pathOf(req);
  if (opts.staticRoot && !path.startsWith("/api")) {
    if (tryServeStatic(req, res, opts.staticRoot)) return;
  }
  await honoListener(req, res);
}
