import { findPendingGetDevice, shownDeviceFromPart } from "./device-tools";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const fromTool = shownDeviceFromPart(
  {
    type: "tool-run_firmware",
    toolCallId: "rf-1",
    state: "output-available",
    output: { running: "firmware.esp32c3.bin", chip: "esp32c3" },
  },
  0,
  "msg-1"
);
expect(fromTool?.device === "firmware.esp32c3.bin", "run_firmware shown path");

const fromData = shownDeviceFromPart(
  { type: "data-device", data: { device: "firmware.esp32c3.bin" } },
  1,
  "msg-1"
);
expect(fromData?.device === "firmware.esp32c3.bin", "data-device shown path");
expect(
  shownDeviceFromPart(
    { type: "tool-run_firmware", state: "input-available" },
    0,
    "msg-1"
  ) === null,
  "pending run is not shown"
);

const pending = findPendingGetDevice([
  {
    role: "assistant",
    parts: [
      {
        type: "tool-get_device",
        toolCallId: "gd-1",
        state: "input-available",
        input: {},
      },
    ],
  },
]);
expect(pending?.toolCallId === "gd-1", "finds pending get_device");
expect(
  findPendingGetDevice([
    {
      role: "assistant",
      parts: [
        {
          type: "tool-get_device",
          toolCallId: "gd-1",
          state: "output-available",
          output: { device: null },
        },
      ],
    },
  ]) === null,
  "answered get_device is not pending"
);

console.log("device-tools.selfcheck ok");
