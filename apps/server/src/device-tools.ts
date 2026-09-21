import { tool } from "ai";
import { z } from "zod";

import { openDevice, readSerial, sendSerial } from "./emu/host";
import { projectRoot, showDeviceOnClient } from "./viewer-context";

/** What an agent needs from a REPL, not the whole retained log. */
const SERIAL_TAIL = 8_000;

export const deviceTools = {
  // No execute: which image this tab is watching is per client, like get_viewer.
  get_device: tool({
    description:
      "Which firmware image this tab has open, if any. A path or null. Call read_serial for what it has printed.",
    inputSchema: z.object({}),
  }),
  run_firmware: tool({
    description:
      "Boot a firmware image on the shared device and show its console on this tab. Pass a project-relative path whose name ends in .<chip>.bin, such as firmware.esp32c3.bin.",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const root = projectRoot();
      if ("error" in root) return root;
      const opened = await openDevice(root.root, path);
      if ("error" in opened) return opened;
      showDeviceOnClient(opened.path);
      return { running: opened.path, chip: opened.chip };
    },
  }),
  read_serial: tool({
    description:
      "Read the serial log of a firmware image already booted with run_firmware. Omit from to get the tail. Pass the previous next to read only what is new.",
    inputSchema: z.object({
      path: z.string(),
      from: z.number().int().nonnegative().optional(),
    }),
    execute: async ({ path, from }) => {
      const root = projectRoot();
      if ("error" in root) return root;
      const read = readSerial(root.root, path, from ?? 0);
      if ("error" in read) return read;
      if (from !== undefined) return read;
      return { text: read.text.slice(-SERIAL_TAIL), next: read.next };
    },
  }),
  send_serial: tool({
    description:
      "Write a line to the serial port of a firmware image already booted with run_firmware. A newline is added when the text has none.",
    inputSchema: z.object({
      path: z.string(),
      text: z.string().max(8_000),
    }),
    execute: async ({ path, text }) => {
      const root = projectRoot();
      if ("error" in root) return root;
      return sendSerial(root.root, path, text);
    },
  }),
};
