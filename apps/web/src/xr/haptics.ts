export function pulse(
  source: XRInputSource | undefined,
  intensity = 0.22,
  ms = 14
) {
  const actuator = source?.gamepad?.hapticActuators?.[0] as
    | (GamepadHapticActuator & {
        pulse?: (value: number, duration: number) => Promise<boolean>;
      })
    | undefined;
  if (actuator?.pulse) void actuator.pulse(intensity, ms);
}

/** Light tick when the ray enters a button. */
export const pulseHover = (source: XRInputSource | undefined) =>
  pulse(source, 0.15, 10);

/** Firmer tick when a button is clicked. */
export const pulseClick = (source: XRInputSource | undefined) =>
  pulse(source, 0.5, 24);
