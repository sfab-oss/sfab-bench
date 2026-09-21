import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptySnapshot } from "@sfab-bench/contract";

import { deviceTools } from "./device-tools";
import { stopDevice } from "./emu/host";
import { runViewerContext } from "./viewer-context";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

expect(
  typeof deviceTools.get_device.execute !== "function",
  "get_device has no server execute"
);
expect(
  typeof deviceTools.run_firmware.execute === "function",
  "run_firmware stays on the server"
);
expect(
  typeof deviceTools.read_serial.execute === "function",
  "read_serial stays on the server"
);
expect(
  typeof deviceTools.send_serial.execute === "function",
  "send_serial stays on the server"
);

const fixture = fileURLToPath(
  new URL("../fixtures/firmware.esp32c3.bin", import.meta.url)
);
const root = mkdtempSync(join(tmpdir(), "sfab-device-tools-"));
const rel = "firmware.esp32c3.bin";
try {
  copyFileSync(fixture, join(root, rel));
  await runViewerContext(
    {
      root,
      file: "",
      snapshot: emptySnapshot(),
      show: () => {},
    },
    async () => {
      const opened = await deviceTools.run_firmware.execute!(
        { path: rel },
        {} as never
      );
      expect(
        opened && "running" in opened && opened.running === rel,
        "run_firmware boots the image"
      );
      expect(
        opened && "chip" in opened && opened.chip === "esp32c3",
        "run_firmware names the chip"
      );
      const deadline = Date.now() + 20_000;
      let text = "";
      let next = 0;
      while (Date.now() < deadline && !text.includes(">>> ")) {
        const read = await deviceTools.read_serial.execute!(
          { path: rel },
          {} as never
        );
        if (read && "error" in read) throw new Error(String(read.error));
        if (read && "text" in read && typeof read.text === "string") {
          text = read.text;
          next = read.next;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      expect(text.includes("MicroPython"), "read_serial has the banner");
      expect(text.includes(">>> "), "read_serial reaches the prompt");

      const sent = await deviceTools.send_serial.execute!(
        { path: rel, text: "print('SFAB-TOOL', 6*7)" },
        {} as never
      );
      expect(sent && "ok" in sent && sent.ok === true, "send_serial writes");

      while (Date.now() < deadline && !text.includes("SFAB-TOOL 42")) {
        const read = await deviceTools.read_serial.execute!(
          { path: rel, from: next },
          {} as never
        );
        if (read && "error" in read) throw new Error(String(read.error));
        if (read && "text" in read && typeof read.text === "string") {
          text += read.text;
          next = read.next;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      expect(text.includes("SFAB-TOOL 42"), "the tool loop round-trips");
    }
  );
} finally {
  await stopDevice(root, rel);
  rmSync(root, { recursive: true, force: true });
}

console.log("device-tools.selfcheck ok");
