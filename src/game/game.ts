import { Rng } from '../core/rng';
import type { Grid } from '../core/grid';
import { loadAsciiLevel } from '../core/level';
import { Simulation } from '../core/sim';
import { TUNING } from '../data/tuning';

/** Per-tick input, already reduced from raw devices. Keeps game logic device-agnostic and replayable. */
export interface TickInput {
  /** -1, 0 or 1 */
  readonly moveX: number;
  /** -1 (up), 0 or 1 (down) */
  readonly moveY: number;
}

export const NO_INPUT: TickInput = { moveX: 0, moveY: 0 };

export interface Player {
  /** Center position in cell units (sub-cell precision). */
  x: number;
  y: number;
  /** Position at the previous tick, for render interpolation. */
  prevX: number;
  prevY: number;
}

export class Game {
  tick = 0;
  readonly rng: Rng;
  readonly player: Player;
  readonly sim: Simulation;

  constructor(
    readonly grid: Grid,
    spawn: { x: number; y: number },
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    // The world gets its own stream so player/creature randomness never perturbs the chemistry.
    this.sim = new Simulation(grid, this.rng.fork(1).nextU32());
    const x = spawn.x + 0.5;
    const y = spawn.y + 0.5;
    this.player = { x, y, prevX: x, prevY: y };
  }

  static fromAscii(text: string, seed: number): Game {
    const { grid, spawn } = loadAsciiLevel(text, seed);
    return new Game(grid, spawn, seed);
  }

  /** Advance one fixed tick. `simulateWorld: false` freezes the materials (Lab pause) but not the player. */
  step(input: TickInput, simulateWorld = true): void {
    if (simulateWorld) this.sim.step();
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;

    // M1: free (noclip) movement. Physics arrives in M3.
    let dx = Math.sign(input.moveX);
    let dy = Math.sign(input.moveY);
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    const speed = TUNING.playerFreeMoveSpeed / TUNING.simHz;
    p.x = clamp(p.x + dx * speed, 0.5, this.grid.width - 0.5);
    p.y = clamp(p.y + dy * speed, 0.5, this.grid.height - 0.5);

    this.tick++;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
