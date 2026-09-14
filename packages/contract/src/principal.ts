export type Scope = "view" | "chat";

export type ClientPrincipal =
  | { kind: "loopback" }
  | { kind: "paired"; deviceId: string; label: string; scopes: Scope[] }
  | { kind: "account"; userId: string; deviceId: string; scopes: Scope[] };
