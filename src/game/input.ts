/**
 * Per-tick input, already reduced from raw devices. Game logic only ever sees
 * this, which keeps it device-agnostic and replayable in tests.
 */
export interface TickInput {
  /** -1, 0 or 1 */
  readonly moveX: number;
  /** -1 (up), 0 or 1 (down). Down swims down in liquids. */
  readonly moveY: number;
  /** Jump was pressed since the last tick (edge). */
  readonly jumpPressed: boolean;
  /** Jump is held (variable jump height, swimming up). */
  readonly jumpHeld: boolean;
  /** Aim point (mouse) in world cell units. */
  readonly aimX: number;
  readonly aimY: number;
  /** Harvest button (right mouse) is held. */
  readonly harvest: boolean;
}

export const NO_INPUT: TickInput = {
  moveX: 0,
  moveY: 0,
  jumpPressed: false,
  jumpHeld: false,
  aimX: 0,
  aimY: 0,
  harvest: false,
};

/** Convenience for tests: NO_INPUT with overrides. */
export function tickInput(over: Partial<TickInput>): TickInput {
  return { ...NO_INPUT, ...over };
}
