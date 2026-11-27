import { Rng } from '../core/rng';
import type { Grid } from '../core/grid';
import { loadAsciiLevel } from '../core/level';
import { Simulation } from '../core/sim';
import { Harvester, Pouch } from './harvest';
import type { TickInput } from './input';
import { Player } from './player';

export type { TickInput } from './input';
export { NO_INPUT, tickInput } from './input';

/** One level in play: the world, the witch, her pouch and harvesting. */
export class Game {
  tick = 0;
  readonly rng: Rng;
  readonly player: Player;
  readonly sim: Simulation;
  readonly pouch = new Pouch();
  readonly harvester = new Harvester();

  constructor(
    readonly grid: Grid,
    readonly spawn: { readonly x: number; readonly y: number },
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    // The world gets its own stream so player/creature randomness never perturbs the chemistry.
    this.sim = new Simulation(grid, this.rng.fork(1).nextU32());
    this.player = new Player(spawn.x + 0.5, spawn.y + 0.5);
  }

  static fromAscii(text: string, seed: number): Game {
    const { grid, spawn } = loadAsciiLevel(text, seed);
    return new Game(grid, spawn, seed);
  }

  /** Advance one fixed tick. `simulateWorld: false` freezes the materials (Lab pause) but not the player. */
  step(input: TickInput, simulateWorld = true): void {
    if (simulateWorld) this.sim.step();
    this.player.update(input, this.grid, this.sim);
    this.harvester.update(input, this.player, this.grid, this.sim, this.pouch, this.rng);
    this.tick++;
  }
}
