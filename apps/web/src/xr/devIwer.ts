/**
 * Stock Chromium exposes a stub `navigator.xr` that reports no sessions.
 * `@pmndrs/xr` auto-injects IWER only on hostname `localhost`, and its
 * `installRuntime()` never passes `forceInstall`, so IWER skips the stub.
 * Loopback Vite (Mac tab, Electron) needs both: inject here, then force.
 * Quest on the LAN hostname must not take this path.
 */
export function shouldForceIwerOnThisPage(
  hostname: string,
  isDev: boolean
): boolean {
  if (!isDev) return false;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

type IwerRuntime = {
  isNativeXRAvailable?: () => boolean;
  installRuntime?: (options: { forceInstall: boolean }) => void;
};

export function forceIwerRuntimeIfNative(
  emulator: IwerRuntime | null | undefined
): void {
  if (!emulator?.isNativeXRAvailable?.() || !emulator.installRuntime) return;
  emulator.installRuntime({ forceInstall: true });
}
