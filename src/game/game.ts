import { Rng } from '../core/rng';
import type { Grid } from '../core/grid';
import { loadAsciiLevel } from '../core/level';
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

  constructor(
    readonly grid: Grid,
    spawn: { x: number; y: number },
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    const x = spawn.x + 0.5;
    const y = spawn.y + 0.5;
    this.player = { x, y, prevX: x, prevY: y };
  }

  static fromAscii(text: string, seed: number): Game {
    const { grid, spawn } = loadAsciiLevel(text, seed);
    return new Game(grid, spawn, seed);
  }

  /** Advance one fixed tick. */
  step(input: TickInput): void {
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
