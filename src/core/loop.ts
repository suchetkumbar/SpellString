/**
 * Fixed-timestep accumulator. Pure logic (no timers): the host feeds it frame
 * deltas and runs the number of simulation steps it returns.
 */
export class FixedStep {
  readonly stepMs: number;
  private acc = 0;
  /** Total steps discarded because a frame needed more than maxSteps. */
  droppedSteps = 0;

  constructor(
    hz: number,
    private readonly maxSteps: number,
    /** Frame deltas above this are clamped (tab switches, breakpoints). */
    private readonly maxFrameMs = 250,
  ) {
    this.stepMs = 1000 / hz;
  }

  /** Add a frame delta; returns how many fixed steps to simulate now. */
  advance(dtMs: number): number {
    this.acc += Math.min(Math.max(dtMs, 0), this.maxFrameMs);
    // Epsilon absorbs float error (250 / (1000/60) = 14.999...) so whole steps aren't lost.
    let steps = Math.floor(this.acc / this.stepMs + 1e-6);
    this.acc = Math.max(0, this.acc - steps * this.stepMs);
    if (steps > this.maxSteps) {
      this.droppedSteps += steps - this.maxSteps;
      steps = this.maxSteps;
    }
    return steps;
  }

  /** Interpolation factor in [0, 1) between the previous and current tick. */
  get alpha(): number {
    return this.acc / this.stepMs;
  }

  reset(): void {
    this.acc = 0;
  }
}
