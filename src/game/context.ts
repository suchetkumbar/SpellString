import type { Grid } from '../core/grid';
import type { Rng } from '../core/rng';
import type { Simulation } from '../core/sim';
import type { CreatureKey } from '../data/creatures';
import type { Carriers } from './carriers';
import type { Creature } from './creature';
import type { Effects } from './effects';
import type { Harvester, Pouch } from './harvest';
import type { RunStats } from './stats';
import type { Player } from './player';
import type { Wand } from './wand';
import type { PlannedCast } from './spell/plan';

export type MessageKind = 'info' | 'warn' | 'fizzle';

/** What the game systems (casting, carriers, creatures) see of the game. */
export interface GameContext {
  readonly tick: number;
  readonly grid: Grid;
  readonly sim: Simulation;
  readonly rng: Rng;
  readonly player: Player;
  readonly pouch: Pouch;
  readonly harvester: Harvester;
  readonly stats: RunStats;
  readonly wand: Wand;
  readonly creatures: Creature[];
  readonly carriers: Carriers;
  readonly effects: Effects;
  say(text: string, kind: MessageKind): void;
  spawnCreature(key: CreatureKey, x: number, y: number, generation?: number): Creature;
  /** The witch's own carrier burst at (x, y): burns nearby count as her own fire or steam. */
  noteOwnBurst(x: number, y: number, payload: readonly number[]): void;
  /** `!`: fire these casts from (x, y) along `angle` (charges are spent now, fizzles as usual). */
  castFrom(casts: readonly PlannedCast[], x: number, y: number, angle: number, spell: string | null): void;
}
