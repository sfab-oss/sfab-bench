import { hc } from "hono/client";

import type { AppType } from "@sfab-bench/server/app";

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

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getDeviceToken();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** JSON routes via hc. Chat, transcribe, and cad-pkg use apiFetch. */
export const jsonApi = hc<AppType>("/api", {
  headers: () => authHeaders(),
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
