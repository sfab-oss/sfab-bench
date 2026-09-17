import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function pathOf(req: IncomingMessage) {
  return (req.url ?? "/").split("?")[0];
}

export function tryServeStatic(
  req: IncomingMessage,
  res: ServerResponse,
  root: string
): boolean {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOf(req));
  } catch {
    return false;
  }
  if (decoded.includes("\0")) return false;

  const rootAbs = resolve(root);
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  let file = resolve(rootAbs, rel);
  if (file !== rootAbs && !file.startsWith(rootAbs + sep)) return false;

  if (existsSync(file) && statSync(file).isDirectory())
    file = join(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) {
    file = join(rootAbs, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) return false;
  }

  res.statusCode = 200;
  res.setHeader(
    "content-type",
    MIME[extname(file).toLowerCase()] ?? "application/octet-stream"
  );
  if (method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(file).pipe(res);
  return true;
}
