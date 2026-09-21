import { firmwareChip } from "@sfab-bench/contract";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

expect(firmwareChip("firmware.esp32c3.bin") === "esp32c3", "plain c3 image");
expect(firmwareChip("cad/app.ESP32C3.BIN") === "esp32c3", "directory and case");
expect(firmwareChip("firmware.bin") === null, "bare bin is not a document");
expect(
  firmwareChip("bootloader.bin") === null,
  "bootloader bin is not a document"
);
expect(
  firmwareChip("firmware.esp32.bin") === null,
  "original esp32 is not a catalog chip"
);
expect(firmwareChip("firmware.esp32s3.bin") === null, "s3 is not accepted yet");
expect(
  firmwareChip("firmware.esp32c3.bin.bak") === null,
  "suffix has to be the end of the name"
);

console.log("device.selfcheck ok");
