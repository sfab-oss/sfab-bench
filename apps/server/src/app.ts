import { zValidator } from "@hono/zod-validator";
import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import type { UIMessage } from "ai";

import { handleCadPkg, handleProjectFile } from "./cad-pkg";
import { handleChat } from "./chat";
import { listHarnesses } from "./harnesses";
import { listOpenCodeModels } from "./models";
import { ensureOffer, joinInfo, labelFromUserAgent, mintOffer, redeemCode, redeemFragment } from "./pairing";
import { hasScope, publicPrincipal, resolvePrincipal, runWithPrincipal, type ClientPrincipal, type Scope } from "./principal";
import {
  catalogRevision,
  currentProject,
  hasProject,
  listBrowse,
  listProjectFiles,
  listRecents,
  openProject,
  projectPath,
} from "./projects";
import { createThread, getThread, listThreads, saveMessages } from "./threads-db";
import { handleTranscribe } from "./transcribe";
import {
  ensureSessionThread,
  snapshotFor,
  setSessionDoc,
  setSessionPrefs,
  setSessionSelection,
  setSessionThread,
  stopSessionRun,
} from "./session";

export type AppEnv = {
  Bindings: HttpBindings;
  Variables: { principal: ClientPrincipal };
};

const pairBodySchema = z
  .object({
    code: z.string().optional(),
    fragment: z.string().optional(),
  })
  .refine((body) => Boolean(body.code?.trim() || body.fragment?.trim()), {
    message: "code or fragment required",
  });

const saveMessagesSchema = z.object({
  messages: z.array(z.unknown()),
});

const openProjectSchema = z.object({
  path: z.string().min(1),
});

const sessionDocSchema = z.object({
  file: z.string().nullable(),
  reload: z.boolean().optional(),
});

const sessionSelectionSchema = z.object({
  ref: z.string().nullable(),
  name: z.string().optional(),
});

const sessionThreadSchema = z.object({
  id: z.string().optional(),
  create: z.boolean().optional(),
});

const sessionPrefsSchema = z.object({
  harness: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
});

function denyScope(c: { get: (key: "principal") => ClientPrincipal; json: (body: unknown, status: 403) => Response }, scope: Scope) {
  if (hasScope(c.get("principal"), scope)) return null;
  return c.json({ error: "missing scope" }, 403);
}

function denyLoopback(c: { get: (key: "principal") => ClientPrincipal; json: (body: unknown, status: 403) => Response }) {
  if (c.get("principal").kind === "loopback") return null;
  return c.json({ error: "only for this Mac" }, 403);
}

function denyNoProject(c: { json: (body: unknown, status: 409) => Response }) {
  if (hasProject()) return null;
  return c.json({ error: "open a folder first" }, 409);
}

function isPublicPair(method: string, path: string) {
  const clean = path.replace(/\/$/, "") || "/";
  return method === "POST" && (clean === "/pair" || clean === "/api/pair");
}

function projectPayload() {
  return {
    project: currentProject(),
    recents: listRecents(),
    revision: catalogRevision(),
  };
}

export const api = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (isPublicPair(c.req.method, path)) {
      await next();
      return;
    }
    const principal = resolvePrincipal(c.env.incoming);
    if (!principal) return c.json({ error: "pairing required" }, 401);
    c.set("principal", principal);
    await runWithPrincipal(principal, () => next());
  })
  .post("/pair", zValidator("json", pairBodySchema), (c) => {
    const body = c.req.valid("json");
    const label = labelFromUserAgent(c.req.header("user-agent") ?? undefined);
    const code = body.code?.trim() ?? "";
    const fragment = body.fragment?.trim() ?? "";
    const result = code ? redeemCode(code, label) : redeemFragment(fragment, label);
    if (result === "expired") return c.json({ error: "pairing code expired" }, 410);
    if (result === "invalid") return c.json({ error: "pairing failed" }, 401);
    return c.json(result);
  })
  .get("/me", (c) => c.json({ principal: publicPrincipal(c.get("principal")) }))
  .get("/pairing", (c) => {
    if (c.get("principal").kind !== "loopback") {
      return c.json({ error: "pairing info is only for this Mac" }, 403);
    }
    return c.json(joinInfo(ensureOffer()));
  })
  .post("/pairing", (c) => {
    if (c.get("principal").kind !== "loopback") {
      return c.json({ error: "pairing info is only for this Mac" }, 403);
    }
    return c.json(joinInfo(mintOffer()));
  })
  .get("/project", (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    return c.json(projectPayload());
  })
  .post("/project", zValidator("json", openProjectSchema), (c) => {
    const denied = denyLoopback(c);
    if (denied) return denied;
    try {
      openProject(c.req.valid("json").path);
      return c.json(projectPayload());
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return c.json({ error: err instanceof Error ? err.message : String(err) }, status as 400);
    }
  })
  .get("/browse", (c) => {
    const denied = denyLoopback(c);
    if (denied) return denied;
    try {
      return c.json(listBrowse(c.req.query("path")));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return c.json({ error: err instanceof Error ? err.message : String(err) }, status as 400);
    }
  })
  .get("/catalog", (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    if (!hasProject()) return c.json({ files: [], revision: catalogRevision() });
    return c.json({ files: listProjectFiles(projectPath()), revision: catalogRevision() });
  })
  .get("/session", (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    return c.json(snapshotFor(c.get("principal")));
  })
  .post("/session/doc", zValidator("json", sessionDocSchema), (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    try {
      const body = c.req.valid("json");
      return c.json({ doc: setSessionDoc(body.file, { reload: body.reload }) });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return c.json({ error: err instanceof Error ? err.message : String(err) }, status as 400);
    }
  })
  .post("/session/selection", zValidator("json", sessionSelectionSchema), (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    const body = c.req.valid("json");
    return c.json({ doc: setSessionSelection(body.ref, body.name, c.get("principal")) });
  })
  .post("/session/thread", zValidator("json", sessionThreadSchema), (c) => {
    const denied = denyScope(c, "chat") ?? denyNoProject(c);
    if (denied) return denied;
    try {
      const body = c.req.valid("json");
      if (body.create) {
        const row = createThread(projectPath(), snapshotFor(c.get("principal")).thread);
        return c.json(setSessionThread(row.id), 201);
      }
      if (body.id) return c.json(setSessionThread(body.id));
      const ensured = ensureSessionThread();
      return c.json({ id: ensured.id, created: ensured.created });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return c.json({ error: err instanceof Error ? err.message : String(err) }, status as 400);
    }
  })
  .post("/session/prefs", zValidator("json", sessionPrefsSchema), (c) => {
    const denied = denyScope(c, "chat");
    if (denied) return denied;
    const body = c.req.valid("json");
    return c.json({
      thread: setSessionPrefs({
        harness: body.harness as never,
        model: body.model,
        effort: body.effort as never,
      }),
    });
  })
  .post("/chat/stop", (c) => {
    const denied = denyScope(c, "chat");
    if (denied) return denied;
    stopSessionRun();
    return c.json({ ok: true });
  })
  .get("/models", async (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    return c.json(await listOpenCodeModels());
  })
  .get("/harnesses", async (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    return c.json(await listHarnesses());
  })
  .get("/threads", (c) => {
    const denied = denyScope(c, "chat") ?? denyNoProject(c);
    if (denied) return denied;
    return c.json(listThreads(projectPath()));
  })
  .post("/threads", (c) => {
    const denied = denyScope(c, "chat") ?? denyNoProject(c);
    if (denied) return denied;
    return c.json(createThread(projectPath()), 201);
  })
  .get("/threads/:id", (c) => {
    const denied = denyScope(c, "chat") ?? denyNoProject(c);
    if (denied) return denied;
    const row = getThread(c.req.param("id"), projectPath());
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .put("/threads/:id", zValidator("json", saveMessagesSchema), (c) => {
    const denied = denyScope(c, "chat") ?? denyNoProject(c);
    if (denied) return denied;
    const { messages } = c.req.valid("json");
    if (!saveMessages(c.req.param("id"), projectPath(), messages as UIMessage[])) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json({ ok: true });
  })
  .post("/chat", async (c) => {
    const denied = denyScope(c, "chat") ?? denyNoProject(c);
    if (denied) return denied;
    return handleChat(c.req.raw);
  })
  .post("/transcribe", async (c) => {
    const denied = denyScope(c, "chat");
    if (denied) return denied;
    return handleTranscribe(c.req.raw);
  })
  .on(["GET", "HEAD"], "/cad-pkg/*", async (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    return handleCadPkg(c.req.raw);
  })
  .on(["GET", "HEAD"], "/files/*", async (c) => {
    const denied = denyScope(c, "view");
    if (denied) return denied;
    return handleProjectFile(c.req.raw);
  });

export const app = new Hono().route("/api", api);
export type AppType = typeof api;
