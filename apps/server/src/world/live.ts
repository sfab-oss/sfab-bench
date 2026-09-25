import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  SERIAL_TEXT_MAX,
  WORLD_NONCE_MAX,
  type WorldClientMessage,
  type WorldSender,
} from "@sfab-bench/contract";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

import type { ClientPrincipal } from "../principal";
import { resolveUpgradePrincipal, runWithPrincipal } from "../principal";
import { resolveRequestRoot } from "../projects";
import { attachWorld, type WorldHandle } from "./host";

/**
 * A world run is per document and streams poses at 30 Hz. The session
 * socket is one process-wide library stream, so this is its own upgrade:
 * `/api/world/live?project=&world=`. Auth matches the other project routes:
 * loopback is trusted, everyone else needs a paired token.
 */

const wss = new WebSocketServer({ noServer: true });

function reject(socket: Duplex, status: number, reason: string) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function worldSender(principal: ClientPrincipal): WorldSender {
  // resolveUpgradePrincipal only returns loopback or a paired device.
  // An account principal is not produced on this path.
  if (principal.kind === "paired") {
    return { kind: "paired", label: principal.label || "Quest" };
  }
  if (principal.kind === "loopback") return { kind: "loopback", label: "Mac" };
  throw new Error("an account principal cannot open a world socket");
}

function parseClient(raw: string): WorldClientMessage | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { error: "message is not JSON" };
  }
  if (!value || typeof value !== "object")
    return { error: "message is not an object" };
  const type = (value as { type?: unknown }).type;
  if (type === "play" || type === "pause") {
    const nonce = (value as { nonce?: unknown }).nonce;
    if (nonce === undefined) return { type };
    if (
      typeof nonce !== "string" ||
      nonce.length < 1 ||
      nonce.length > WORLD_NONCE_MAX
    ) {
      return { error: "nonce must be a short string" };
    }
    return { type, nonce };
  }
  if (type === "step") {
    const n = (value as { n?: unknown }).n;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      return { error: "step needs a whole number of steps" };
    }
    return { type: "step", n };
  }
  if (type === "serial-send") {
    const board = (value as { board?: unknown }).board;
    const text = (value as { text?: unknown }).text;
    if (typeof board !== "string" || board.length < 1 || board.length > 64) {
      return { error: "serial needs a board id" };
    }
    if (typeof text !== "string" || text.length > SERIAL_TEXT_MAX) {
      return {
        error: `serial text must be a string of at most ${SERIAL_TEXT_MAX} characters`,
      };
    }
    const nonce = (value as { nonce?: unknown }).nonce;
    if (nonce === undefined) return { type: "serial-send", board, text };
    if (
      typeof nonce !== "string" ||
      nonce.length < 1 ||
      nonce.length > WORLD_NONCE_MAX
    ) {
      return { error: "nonce must be a short string" };
    }
    return { type: "serial-send", board, text, nonce };
  }
  return { error: "unknown world message" };
}

function send(ws: WebSocket, event: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

wss.on(
  "connection",
  (
    ws: WebSocket,
    _req: IncomingMessage,
    principal: ClientPrincipal,
    project: string,
    world: string
  ) => {
    let handle: WorldHandle | null = null;
    let closed = false;
    ws.on("close", () => {
      closed = true;
      handle?.detach();
    });
    ws.on("error", () => {
      closed = true;
      handle?.detach();
    });
    // A rejected attach must not become an unhandled rejection: that would
    // take down the API process.
    runWithPrincipal(principal, async () => {
      const attached = await attachWorld(project, world, {
        sender: worldSender(principal),
        onEvent(event) {
          send(ws, event);
        },
      });
      if ("error" in attached) {
        send(ws, {
          type: "error",
          errors: [],
          message: attached.error,
        });
        ws.close();
        return;
      }
      if (closed) {
        attached.detach();
        return;
      }
      handle = attached;
      ws.on("message", (data) => {
        const parsed = parseClient(String(data));
        if ("error" in parsed) {
          send(ws, { type: "error", errors: [], message: parsed.error });
          return;
        }
        if (parsed.type === "play") handle?.play(parsed.nonce);
        else if (parsed.type === "pause") handle?.pause(parsed.nonce);
        else if (parsed.type === "serial-send") {
          const sent = handle?.sendSerial(
            parsed.board,
            parsed.text,
            parsed.nonce
          );
          if (sent && "error" in sent) {
            send(ws, { type: "error", errors: [], message: sent.error });
          }
        } else if (principal.kind !== "loopback") {
          send(ws, {
            type: "error",
            errors: [],
            message: "step is only for this Mac",
          });
        } else handle?.step(parsed.n);
      });
    }).catch((err: unknown) => {
      console.error("[world] attach failed", err);
      send(ws, {
        type: "error",
        errors: [],
        message: "could not open this world",
      });
      ws.close();
    });
  }
);

export function tryUpgradeWorld(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): boolean {
  const path = (req.url ?? "").split("?")[0];
  if (path !== "/api/world/live") return false;
  const principal = resolveUpgradePrincipal(req);
  if (!principal) {
    reject(socket, 401, "Unauthorized");
    return true;
  }
  let url: URL;
  try {
    url = new URL(req.url ?? "", "http://localhost");
  } catch {
    reject(socket, 400, "Bad Request");
    return true;
  }
  const world = url.searchParams.get("world")?.trim() ?? "";
  if (!world) {
    reject(socket, 400, "Bad Request");
    return true;
  }
  let project: string | null;
  try {
    project = resolveRequestRoot(
      url.searchParams.get("project") ?? undefined,
      principal.kind
    );
  } catch (err) {
    const status = (err as { status?: number }).status === 403 ? 403 : 400;
    reject(socket, status, status === 403 ? "Forbidden" : "Bad Request");
    return true;
  }
  if (!project) {
    reject(socket, 409, "Conflict");
    return true;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    runWithPrincipal(principal, () => {
      wss.emit("connection", ws, req, principal, project, world);
    });
  });
  return true;
}
