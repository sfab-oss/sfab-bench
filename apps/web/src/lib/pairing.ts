import { jsonApi, setDeviceToken } from "@/lib/api";

const FRAGMENT_PREFIX = "p.";

export function takePairingFragment(): string | null {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw.startsWith(FRAGMENT_PREFIX)) return null;
  const next = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", next);
  return raw;
}

export async function redeemPairing(body: {
  code?: string;
  fragment?: string;
}) {
  const res = await jsonApi.pair.$post({ json: body });
  const payload = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !payload.token) {
    const error = payload.error || res.statusText;
    const expired = res.status === 410;
    throw Object.assign(
      new Error(
        expired
          ? "That code expired. Ask the Mac for a new one."
          : "That code did not work."
      ),
      {
        expired,
        cause: error,
      }
    );
  }
  setDeviceToken(payload.token);
}

let fragmentRedeem: Promise<boolean> | null = null;

async function redeemFragmentTokenOnce(): Promise<boolean> {
  const fragment = takePairingFragment();
  if (!fragment) return false;
  await redeemPairing({ fragment });
  return true;
}

export function redeemFragmentToken(): Promise<boolean> {
  if (!fragmentRedeem) fragmentRedeem = redeemFragmentTokenOnce();
  return fragmentRedeem;
}

export type PairingInfo = {
  lanUrl: string | null;
  lanUrls: string[];
  pairUrl: string | null;
  fragmentUrl: string | null;
  code: string;
  expiresAt: number;
};

export async function fetchPairingInfo(): Promise<PairingInfo> {
  const res = await jsonApi.pairing.$get();
  if (!res.ok) throw new Error("Could not load pairing info");
  return (await res.json()) as PairingInfo;
}

export async function rotatePairingInfo(): Promise<PairingInfo> {
  const res = await jsonApi.pairing.$post();
  if (!res.ok) throw new Error("Could not mint a new code");
  return (await res.json()) as PairingInfo;
}
