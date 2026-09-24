/**
 * esp-emu v0.43.0, the wasm build from
 * `espressif/esp-emulator` release asset `esp-emu-0.43.0-wasm.tar.gz`
 * (sha256 7f19e9fcecc4aa05634d232ee659b05c8505e8cfa5633274726cba443f60a312).
 * The loader checks the extracted files below before init. ADR 0008.
 */
export const ESP_EMU_VERSION = "0.43.0";

export const ESP_EMU_JS_SHA256 =
  "077f4efee045e1da4b6300a7c6ddd48b9e7a95704b58e353b875654cfc4691e9";

export const ESP_EMU_WASM_SHA256 =
  "464828e0e402343f7907ba4a0c5fbba9bbbb93a39d7f608722b472e04fe57db8";

/**
 * ESP-IDF v5.5.5 C3 image that prints `SFAB-C3 ready` and echoes one
 * serial line. Merged flash (bootloader + partition table + app).
 */
export const IDF_ECHO_C3_SHA256 =
  "8a5406ac2741245823dc54ab48372127becac8a801519532269201da14285237";
