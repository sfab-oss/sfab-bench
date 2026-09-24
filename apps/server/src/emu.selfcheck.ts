import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { openDevice, readSerial, sendSerial, stopDevice } from "./emu/host";
import { IDF_ECHO_C3_SHA256 } from "./emu/pin";
import { resolveFirmware } from "./emu/resolve";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const fixture = fileURLToPath(
  new URL("../fixtures/firmware.esp32c3.bin", import.meta.url)
);
const image = readFileSync(fixture);
const hash = createHash("sha256").update(image).digest("hex");
expect(hash === IDF_ECHO_C3_SHA256, `fixture checksum ${hash}`);

const root = mkdtempSync(join(tmpdir(), "sfab-emu-"));
const rel = "firmware.esp32c3.bin";
try {
  copyFileSync(fixture, join(root, rel));
  writeFileSync(join(root, "firmware.bin"), "not a document");
  expect(
    "error" in resolveFirmware(root, "firmware.bin"),
    "bare bin is refused"
  );

  const opened = await openDevice(root, rel);
  if ("error" in opened) throw new Error(opened.error);
  expect(opened.chip === "esp32c3", "opens as esp32c3");

  const deadline = Date.now() + 20_000;
  let log = "";
  while (Date.now() < deadline && !log.includes("SFAB-C3 ready")) {
    const read = readSerial(root, rel, 0);
    if ("error" in read) throw new Error(read.error);
    log = read.text;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  expect(log.includes("SFAB-C3 ready"), "banner says ready");

  const sent = sendSerial(root, rel, "SFAB-BENCH");
  expect(!("error" in sent), "serial send");
  while (Date.now() < deadline && !log.includes("echo SFAB-BENCH")) {
    const read = readSerial(root, rel, 0);
    if ("error" in read) throw new Error(read.error);
    log = read.text;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  expect(log.includes("echo SFAB-BENCH"), "firmware echoes the line");

  await stopDevice(root, rel);
  const stopped = readSerial(root, rel, 0);
  expect(
    "error" in stopped && stopped.error === "device is not running",
    "a stopped machine tells the console to open again"
  );
  const again = await openDevice(root, rel);
  if ("error" in again) throw new Error(again.error);
  let rebooted = "";
  const againDeadline = Date.now() + 20_000;
  while (Date.now() < againDeadline && !rebooted.includes("SFAB-C3 ready")) {
    const read = readSerial(root, rel, 0);
    if ("error" in read) throw new Error(read.error);
    rebooted = read.text;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  expect(rebooted.includes("SFAB-C3 ready"), "opening again prints ready");
} finally {
  await stopDevice(root, rel);
  rmSync(root, { recursive: true, force: true });
}

console.log("emu.selfcheck ok");
