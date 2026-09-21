import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ESP_EMU_JS_SHA256, ESP_EMU_VERSION, ESP_EMU_WASM_SHA256 } from "./pin";

/**
 * Cycles per `run_batch` call. The v0.43 probe used this and reached the
 * MicroPython prompt in about 200 ms. The return value is not one type:
 * a string, a byte array, or `{ uart }`.
 */
export const RUN_BATCH_CYCLES = 50_000;

type Emulator = {
  has_default_rom: () => boolean;
  load_default_rom: () => void;
  set_boot_from_rom: (on: boolean) => void;
  load_firmware: (bytes: Uint8Array) => void;
  run_batch: (cycles: number) => unknown;
  uart_input: (bytes: Uint8Array) => void;
};

type EmuModule = {
  default: (opts: { module_or_path: Uint8Array }) => Promise<unknown>;
  WasmEmulator: new (chip: string) => Emulator;
};

export type RunningEmulator = Emulator;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Checkout layout, then the layout of a bundled worker beside `dist/`. */
export function vendorDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../vendor/esp-emu", ESP_EMU_VERSION),
    join(here, "../vendor/esp-emu", ESP_EMU_VERSION),
  ];
  const found = candidates.find((dir) =>
    existsSync(join(dir, "esp_emu_bg.wasm"))
  );
  if (!found) {
    throw new Error(
      `esp-emu ${ESP_EMU_VERSION} is not in this build (looked in ${candidates.join(", ")})`
    );
  }
  return found;
}

export function readPinnedWasm(): { jsHref: string; wasm: Uint8Array } {
  const dir = vendorDir();
  const js = readFileSync(join(dir, "esp_emu.js"));
  const wasm = readFileSync(join(dir, "esp_emu_bg.wasm"));
  const jsHash = sha256(js);
  const wasmHash = sha256(wasm);
  if (jsHash !== ESP_EMU_JS_SHA256) {
    throw new Error(
      `esp-emu js checksum is ${jsHash}, expected ${ESP_EMU_JS_SHA256}`
    );
  }
  if (wasmHash !== ESP_EMU_WASM_SHA256) {
    throw new Error(
      `esp-emu wasm checksum is ${wasmHash}, expected ${ESP_EMU_WASM_SHA256}`
    );
  }
  return { jsHref: pathToFileURL(join(dir, "esp_emu.js")).href, wasm };
}

export function uartText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result instanceof Uint8Array) return new TextDecoder().decode(result);
  if (result && typeof result === "object" && "uart" in result) {
    return uartText((result as { uart: unknown }).uart);
  }
  return "";
}

/** Load the pinned wasm and boot its default ROM. Firmware comes next. */
export async function loadEmulator(chip: string): Promise<Emulator> {
  const pinned = readPinnedWasm();
  const mod = (await import(pinned.jsHref)) as EmuModule;
  await mod.default({ module_or_path: pinned.wasm });
  const emu = new mod.WasmEmulator(chip);
  if (!emu.has_default_rom()) {
    throw new Error(`esp-emu has no default ROM for ${chip}`);
  }
  emu.load_default_rom();
  emu.set_boot_from_rom(true);
  return emu;
}
