# esp-emu 0.43.0 (wasm)

Vendored from the Espressif `esp-emulator` release asset
`esp-emu-0.43.0-wasm.tar.gz` (Apache-2.0, see `LICENSE`). The server
checks `esp_emu.js` and `esp_emu_bg.wasm` against the sha256 constants in
`apps/server/src/emu/pin.ts` before init.

The desktop `.app` does not copy this directory. ADR 0008.
