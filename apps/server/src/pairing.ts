import { createHash, randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import type { DatabaseSync } from "node:sqlite";

import { publicPort } from "./config";
import { db as defaultDb } from "./db";
import type { Scope } from "./principal";

export const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type PairingOffer = {
  code: string;
  fragment: string;
  expiresAt: number;
};

export type IssuedDevice = {
  token: string;
  deviceId: string;
  label: string;
  scopes: Scope[];
};

export type StoredDevice = {
  id: string;
  label: string;
  scopes: Scope[];
};

const PAIRED_SCOPES: Scope[] = ["view", "chat"];

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomCode() {
  const bytes = randomBytes(6);
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ensurePairingSchema(db: DatabaseSync = defaultDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pairing_offers (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code TEXT NOT NULL,
      fragment TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
}

function parseScopes(raw: string): Scope[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Scope => item === "view" || item === "chat"
    );
  } catch {
    return [];
  }
}

export function mintOffer(
  db: DatabaseSync = defaultDb,
  now = Date.now()
): PairingOffer {
  ensurePairingSchema(db);
  const offer: PairingOffer = {
    code: randomCode(),
    fragment: `p.${randomBytes(24).toString("base64url")}`,
    expiresAt: now + CODE_TTL_MS,
  };
  db.prepare(
    "INSERT INTO pairing_offers (id, code, fragment, expires_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, fragment = excluded.fragment, expires_at = excluded.expires_at"
  ).run(offer.code, offer.fragment, offer.expiresAt);
  return offer;
}

export function readOffer(db: DatabaseSync = defaultDb): PairingOffer | null {
  ensurePairingSchema(db);
  const row = db
    .prepare(
      "SELECT code, fragment, expires_at FROM pairing_offers WHERE id = 1"
    )
    .get() as
    | { code: string; fragment: string; expires_at: number }
    | undefined;
  if (!row) return null;
  return { code: row.code, fragment: row.fragment, expiresAt: row.expires_at };
}

export function ensureOffer(
  db: DatabaseSync = defaultDb,
  now = Date.now()
): PairingOffer {
  const current = readOffer(db);
  if (current && current.expiresAt > now) return current;
  return mintOffer(db, now);
}

function consumeOffer(db: DatabaseSync) {
  db.prepare("DELETE FROM pairing_offers WHERE id = 1").run();
}

function issueDevice(
  db: DatabaseSync,
  label: string,
  now: number
): IssuedDevice {
  const id = crypto.randomUUID();
  const token = `d.${randomBytes(32).toString("base64url")}`;
  db.prepare(
    "INSERT INTO devices (id, label, token_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, label, sha256(token), JSON.stringify(PAIRED_SCOPES), now);
  return { token, deviceId: id, label, scopes: PAIRED_SCOPES };
}

export function redeemCode(
  code: string,
  label: string,
  now = Date.now(),
  db: DatabaseSync = defaultDb
): IssuedDevice | "invalid" | "expired" {
  ensurePairingSchema(db);
  const offer = readOffer(db);
  if (!offer || normalizeCode(offer.code) !== normalizeCode(code))
    return "invalid";
  if (offer.expiresAt <= now) {
    consumeOffer(db);
    return "expired";
  }
  const device = issueDevice(db, label, now);
  consumeOffer(db);
  return device;
}

export function redeemFragment(
  fragment: string,
  label: string,
  now = Date.now(),
  db: DatabaseSync = defaultDb
): IssuedDevice | "invalid" | "expired" {
  ensurePairingSchema(db);
  const offer = readOffer(db);
  if (!offer || offer.fragment !== fragment) return "invalid";
  if (offer.expiresAt <= now) {
    consumeOffer(db);
    return "expired";
  }
  const device = issueDevice(db, label, now);
  consumeOffer(db);
  return device;
}

export function lookupDevice(
  token: string,
  db: DatabaseSync = defaultDb
): StoredDevice | null {
  ensurePairingSchema(db);
  const row = db
    .prepare("SELECT id, label, scopes FROM devices WHERE token_hash = ?")
    .get(sha256(token)) as
    | { id: string; label: string; scopes: string }
    | undefined;
  if (!row) return null;
  const scopes = parseScopes(row.scopes);
  if (scopes.length === 0) return null;
  return { id: row.id, label: row.label, scopes };
}

export function lanIPv4s(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

export function labelFromUserAgent(ua: string | undefined): string {
  const value = ua ?? "";
  if (/Quest|Oculus/i.test(value)) return "Quest";
  if (/Mobile|Android|iPhone/i.test(value)) return "Phone";
  return "Browser";
}

ensurePairingSchema();

export function joinInfo(offer: PairingOffer) {
  const port = publicPort();
  const ips = lanIPv4s();
  const origins = ips.map((ip) => `https://${ip}:${port}`);
  const lanUrl = origins[0] ?? null;
  return {
    lanUrl,
    lanUrls: origins,
    pairUrl: lanUrl ? `${lanUrl}/pair` : null,
    fragmentUrl: lanUrl ? `${lanUrl}/#${offer.fragment}` : null,
    code: offer.code,
    expiresAt: offer.expiresAt,
  };
}
