# Worlds

Bench runs one shared sim per `.world.json`. You play, pause, step, and
read that run. The Mac and Quest watch the same one. Your play or pause
is labeled **agent**.

`get_viewer` names the open file. Pass that project-relative path as
`world` on every tool below.

## The file

Copy `examples/arm/arm.world.json`. Do not invent a second schema. The
pieces, in that file:

- `robots` — a URDF path and a pose. Link meshes are STL or OBJ next to
  the URDF. `examples/arm/robot/arm.urdf` is one revolute joint,
  `shoulder`.
- `environment` — `ground.plane`, optional primitives, optional STEP props.
- `boards` — `chip` (`atmega328p`) and a firmware path (the `.hex`).
  `source` is the `.ino`, shown read-only.
- `parts` — a part model (`sg90`) and `drives: { robot, joint }`.
- `supplies` — voltage, current limit, droop resistance.
- `wires` — pin-to-pin pairs, power and ground included:
  `["usb.5V", "uno.5V"]`, `["usb.GND", "uno.GND"]`,
  `["uno.D9", "servo.signal"]`, `["uno.5V", "servo.V+"]`,
  `["uno.GND", "servo.GND"]`.

`examples/arm/arm-stall.world.json` is the same arm with stall firmware.

## Validator

`world_status` includes `diagnostics` when the document has any. Fix the
common ones like this:

- `board uno: no supply reaches its 5V pin` — wire a supply `5V` to the
  board's `5V`. Until you do, the board never boots. Status says
  **unpowered**.
- `servo … signal must be wired directly to a board pin` — one wire from
  `servo.signal` straight to a board GPIO. A hop through another part
  does not drive the servo.
- `Power pin … shares a net` / `Ground pin … shares a net` — power only
  to power, ground only to ground. A power-to-ground wire is a short.
- `Wire net has outputs …` — one net, one driving pin. Two supply
  positives on one net, or two GPIOs tied together, is this error.
- `driven by analogWrite on … which is not a PWM pin` — `analogWrite`
  parts need a PWM pin. A servo may use any digital pin, including A0–A5.
- `analogWrite on … while a servo signal is wired` — Servo.h takes
  Timer1 and disables PWM on D9 and D10. Move the `analogWrite` part.
- `outside … V` — the supply is outside the board or part range.
- `GND does not reach` — wire the grounds together. Power and ground are
  both explicit.
- `mesh-format` — milestone 1 link meshes are `.stl` or `.obj` at a path
  relative to the URDF. Export STL with `$cad` (`cadgen stl build`).

## Firmware

Bench never compiles. Build the `.hex` outside, then let Bench watch it:

```bash
arduino-cli compile --fqbn arduino:avr:uno \
  --output-dir /tmp/hold-build firmware/hold/hold.ino
cp /tmp/hold-build/hold.ino.hex firmware/hold/hold.hex
```

The CLI writes `<sketch>.ino.hex` into `--output-dir`. Copy that file
onto the `.hex` path the board entry names (`firmware/hold/hold.hex` in
the arm). When that file changes, Bench restarts the board. Edit the
`.ino` with your own file tools. The source view in Bench is read-only.
There is no in-app compiler and no code editor.

`examples/arm/firmware/hold/hold.ino` writes 10°, then 90°, then 120°,
each for one second, and prints the angle. The stall sketch commands 180°
into a joint that cannot get there.

## Run and check

Call these with the `world` path from `get_viewer`. Use sim time. Wait
for the status they return. Do not sample "whatever arrived last".

1. `world_restart` — sim time 0, paused, new recording.
2. `world_step` with `ms` from 1 to 10000 — pauses if it was playing,
   advances exactly that many milliseconds, returns `world_status`.
3. `read_pulses` with `part` — runs of pulse width (equal within 1 µs
   collapsed), each with `commandDeg` and the first and last sim time,
   plus that part's board and pin.
4. `read_recording` — tracks such as `part:servo.pulseUs`,
   `supply:usb.voltage`, `joint:shoulder` or `joint:arm/shoulder`,
   `board:uno.pins`. Default window is the last 5 s, 50 frames, 500 max.
   Events in range are resets, reloads, faults, and serial lines. Serial
   text keeps the last 4000 characters and sets `truncated` when it drops
   the rest.
5. `read_serial` — that board's console. `send_serial` writes to it.
   Neither one plays or pauses.

`world_play` and `world_pause` are the shared run. The last command wins.
Every client shows **agent**.

On the hold arm, step about 3.5 s from a restart. `read_pulses` on
`servo` (D9) shows **647, 1472, and 1781 µs** (±4) for 10°, 90°, and 120°.
The same widths are on the `part:servo.pulseUs` track.

`world_status` lists driven pins only (`D9: out H`), joint positions in
degrees (metres for a prismatic joint), and each part's own board and pin
when several robots share a folder. `warnings` is an array of short
strings, empty when nothing is wrong: a board whose supply is above
brownout and below the 3.78 V an ATmega328P needs at 16 MHz, a joint more
than 1° past its limit, and any validator warning on the document.
`read_recording` uses the same array for the range you asked for (the
worst limit violation in that range, and a 1 ms out-of-SOA dip kept the
way brownout is). It also returns `manifest`: MuJoCo and avr8js versions,
timestep, integrator, frame period, the world file's SHA-256, each
board's firmware path and the SHA-256 of the loaded `.hex`, and the
part-model catalog values in use. The manifest is fixed when the run is
built.

## A reset

Currents follow the part's state, not the voltage. The Uno draws 50 mA.
An SG90 draws 10 mA idle, 250 mA moving, 700 mA stalled. A stall is
`|command − measured| > 5°` and `|velocity| < 5°/s`, held 50 ms. The USB
supply is 5 V, 0.5 A, droop 10 Ω. Above the limit,
`V = 5 − 10 · (I − 0.5)` with I in amperes, clamped at 0. A stall draws
0.75 A and the rail falls to 2.5 V. The Uno resets below 2.7 V: pins
float, the servo goes idle, the voltage recovers, the board boots again,
and the stall repeats.

To explain one: `world_restart` `arm-stall.world.json`, `world_step` 2000,
then `read_recording` from 0 to 2. Expect `resets` ≥ 1 on the board, a
`reset` event, and a supply frame whose `minVoltage` is under 2.7. The
serial line says `— brownout reset —`.

## Not yet

Sensors, ground contact, and rp2040 are later. Link meshes other than
STL or OBJ are rejected. Do not look for a breadboard, a net name, or a
regulator. Do not compile inside Bench, and do not edit the world or the
firmware through a world tool — change the files with your file tools,
then `world_restart` or let the `.hex` watch restart the board.
