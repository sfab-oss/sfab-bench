import type { AppType } from "@sfab-bench/server/app";
import { hc } from "hono/client";
import { projectUrl } from "@/lib/project-query";

const TOKEN_KEY = "sfab-bench.deviceToken";

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setDeviceToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function authHeaders(): Record<string, string> {
  const token = getDeviceToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

function skipProjectPath(pathname: string) {
  const clean = pathname.replace(/\/$/, "") || "/";
  return (
    clean === "/api/me" ||
    clean === "/api/pair" ||
    clean === "/api/pairing" ||
    clean === "/api/settings/stt"
  );
}

function withProject(input: RequestInfo | URL): RequestInfo | URL {
  const project = typeof window === "undefined" ? "" : projectUrl();
  if (!project) return input;

  const apply = (href: string): URL | null => {
    try {
      const url = new URL(href, window.location.origin);
      if (
        !url.pathname.startsWith("/api") ||
        skipProjectPath(url.pathname) ||
        url.searchParams.has("project")
      ) {
        return null;
      }
      url.searchParams.set("project", project);
      return url;
    } catch {
      return null;
    }
  };

  if (typeof input === "string") {
    const url = apply(input);
    if (!url) return input;
    return input.startsWith("http://") || input.startsWith("https://")
      ? url.href
      : `${url.pathname}${url.search}${url.hash}`;
  }
  if (input instanceof URL) {
    const url = apply(input.href);
    return url ?? input;
  }
  const url = apply(input.url);
  return url ? new Request(url, input) : input;
}

export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getDeviceToken();
  if (token && !headers.has("authorization"))
    headers.set("authorization", `Bearer ${token}`);
  return fetch(withProject(input), { ...init, headers });
}

/** JSON routes via hc. Chat, transcribe, and cad-pkg use apiFetch. */
export const jsonApi = hc<AppType>("/api", {
  headers: () => authHeaders(),
  fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
    apiFetch(input, init)) as typeof fetch,
});

export type MePrincipal =
  | { kind: "loopback" }
  | { kind: "paired"; deviceId: string; label: string; scopes: string[] };

export async function fetchMe(): Promise<MePrincipal | null> {
  try {
    const res = await jsonApi.me.$get();
    if (!res.ok) return null;
    const body = await res.json();
    return (body.principal ?? null) as MePrincipal | null;
  } catch {
    return null;
  }
}
