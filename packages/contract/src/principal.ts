export type ClientPrincipal =
  | { kind: "loopback" }
  | { kind: "paired"; deviceId: string; label: string }
  | { kind: "account"; userId: string; deviceId: string };
