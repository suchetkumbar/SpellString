import type { GameEvent } from '../game/context';

/** Feel tuning (render-only: nothing here touches the simulation). */
const JUICE = {
  /** Largest shake offset, cells (at trauma 1). */
  maxShake: 0.9,
  /** Trauma lost per second. */
  traumaDecay: 1.8,
  /** Hit-stop lengths, ms. */
  stopHurt: 70,
  stopKill: 45,
  stopExplode: 80,
  stopDeath: 160,
  /** Screen flash on explosions (0..1 alpha), and its fade per second. */
  flashExplode: 0.35,
  flashDecay: 3,
} as const;

export interface JuiceOptions {
  readonly shake: boolean;
  readonly hitStop: boolean;
  readonly reduceFlashing: boolean;
}

/**
 * Screen shake (trauma squared, smooth noise), hit-stop (a few frames' freeze
 * on heavy hits) and explosion flashes, driven by game events. Each has an off
 * switch in the settings.
 */
export class Juice {
  trauma = 0;
  /** Remaining freeze, ms. */
  hitStopMs = 0;
  /** Current screen flash alpha. */
  flash = 0;
  private t = 0;

  constructor(public options: JuiceOptions) {}

  feed(e: GameEvent): void {
    switch (e.kind) {
      case 'explode':
        this.add(0.3 + e.r * 0.07, JUICE.stopExplode);
        if (!this.options.reduceFlashing) this.flash = Math.max(this.flash, Math.min(0.6, JUICE.flashExplode * (e.r / 5)));
        break;
      case 'hurt':
        this.add(0.25 + Math.min(0.35, e.amount * 0.015), JUICE.stopHurt);
        break;
      case 'kill':
        this.add(0.12, JUICE.stopKill);
        break;
      case 'hit':
        this.add(0.05 + Math.min(0.15, e.amount * 0.006), 0);
        break;
      case 'impact':
        if (e.kinetic) this.add(0.03, 0);
        break;
      case 'death':
        this.add(0.6, JUICE.stopDeath);
        break;
      default:
        break;
    }
  }

  private add(trauma: number, stopMs: number): void {
    this.trauma = Math.min(1, this.trauma + trauma);
    if (this.options.hitStop) this.hitStopMs = Math.max(this.hitStopMs, stopMs);
  }

  /** Game ticks should not run this frame. */
  get stopping(): boolean {
    return this.hitStopMs > 0;
  }

  /** Advance by a frame; returns the shake offset in cells (0, 0 with shake off). */
  update(dtMs: number): { x: number; y: number } {
    const dt = dtMs / 1000;
    this.t += dt;
    this.hitStopMs = Math.max(0, this.hitStopMs - dtMs);
    this.trauma = Math.max(0, this.trauma - JUICE.traumaDecay * dt);
    this.flash = Math.max(0, this.flash - JUICE.flashDecay * dt);
    if (!this.options.shake || this.trauma <= 0) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma * JUICE.maxShake;
    // Smooth pseudo-noise from a few incommensurate sines: no Math.random, no jitter at rest.
    const n = (a: number, b: number, c: number): number => (Math.sin(this.t * a) + Math.sin(this.t * b + 1.3) * 0.6 + Math.sin(this.t * c + 2.1) * 0.3) / 1.9;
    return { x: s * n(47, 83, 131), y: s * n(53, 97, 149) };
  }
}
