# ADR-0008: A firmware image is a second document

**Status:** Accepted
**Date:** 2026-09-21
**Deciders:** Alwurts

## Context

Bench is a workbench for a robot, not a CAD viewer that grew a serial
port. The CAD half already has an open format (STEP, GLB) and a loader
that does not know which tool wrote the file ([ADR 0002](0002-step-loader-occt.md),
[ADR 0004](0004-occt-via-opencascade-js.md)). Firmware needs the same
shape. The toolchain stays in the folder. Bench opens what it produced.

A flash image is that format. Walking every `*.bin` also picks up
bootloaders and partition tables, and the bytes do not name the chip.
The runner cannot boot without the chip. A sidecar manifest would be a
format Bench owns. The filename can carry the chip the way `.step`
already tells the catalog what a file is.

Espressif's `esp-emulator` (Apache-2.0, binary-only, Beta) boots an
ESP32-C3 image under Node. It does not boot the original ESP32. Chips
it does boot, beyond the C3, wait until a row needs them.

## Decision

**A firmware image is a document, beside STEP and GLB.**

The catalog name matches `.<chip>.bin`, case-insensitive. The first
accepted chip id is `esp32c3`, so `firmware.esp32c3.bin` and
`app.esp32c3.bin` are documents. Any other stem is fine. `firmware.bin`,
`bootloader.bin`, and a chip id this build does not list are not
documents. Bench still does not learn which tool wrote the file. The
tool writes `firmware.bin`. The file you open is the one placed under
the suffix.

**CAD and Device are two screens.** The default screen is CAD: STEP and
GLB, the viewport, `get_viewer` and `show_artifact`. Device is desktop
only: `.<chip>.bin` files and the serial console as the screen, with
`get_device`, `run_firmware`, `read_serial`, and `send_serial`. `?file=`
is the CAD document. `?device=` is the firmware image. One screen does
not read the other's document. Both may stay in the URL so switching
back restores the previous file. Putting them on one screen, and
binding telemetry to a CAD part, is deferred. Quest stays CAD.

**One running machine per document.** The key is the project plus the
project-relative image path. Every tab with that `?device=`, and the
agent tools, attach to that one emulator and that one serial log. A
second image is a second machine. The machine stops when the last tab
drops it and no agent call is still using it. A physical serial port,
when that row lands, is the same object: one port, one log.

**The loader is someone else's chip, behind one module.** When it
lands it is `esp-emulator` on a worker thread, the same split as
`occt/build.ts` and `occt/worker.ts`. The version is pinned and the
checksum is checked. Swapping the binary edits that module. This
decision does not put the binary in the desktop `.app`. That packaging
choice stays separate.

The original ESP32 is not a catalog chip. This loader does not boot it.

### Not in this decision

Writing a chip emulator. A managed install of Arduino, ESP-IDF, or
PlatformIO. A circuit editor. The loader row vendors Espressif's
binary behind one module. It does not become a core this repo maintains.

Agent tools that run and read the device are a later row. They follow
this shape instead of reopening it.

## Consequences

### Positive

- A folder can hold a STEP and a flash image, and a tab can show both.
- Two tabs, and the agent, see one serial log for one image.
- The emulator stays a dependency behind a module, as OCCT already is.

### Negative

- Toolchains do not emit the suffix. Someone renames or copies the app
  image. The starter template will, when that row exists.
- The original ESP32 has no catalog name until another core exists.
- A shared machine means one tab's serial write is every tab's serial
  write. That is what one board does.

### Mitigations

- `firmwareChip` in `@sfab-bench/contract` is the suffix rule. The
  catalog walk calls it later. It does not grow a second definition.
- Unknown chip ids fail closed: the file is not a document.
- The desktop `.app` does not gain the emulator binary here.

## Implementation notes

- `packages/contract/src/device.ts` — `firmwareChip`, `DeviceMachine`.
- `apps/server/src/device.selfcheck.ts` — the suffix cases above.
- `apps/server/src/emu/` — pinned esp-emu on a worker, one machine per
  document. `apps/server/src/emu.selfcheck.ts` boots the committed
  MicroPython C3 image to `>>>`.
- The catalog lists the suffix. CAD screens show STEP and GLB. The
  device screen shows the suffix and the console. The `.app` does not
  copy the wasm.

## Related

- [0002](0002-step-loader-occt.md) — a loader, not an adapter
- [0003](0003-library-not-viewport.md) — which file a tab watches stays per tab
- [0004](0004-occt-via-opencascade-js.md) — the module boundary this loader copies
- [0006](0006-folder-is-a-tab.md) — two folders stay live, so the machine is not one process-global slot
- [`product.md`](../product.md) — ranked rows after this one
