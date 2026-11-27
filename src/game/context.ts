import type { Grid } from '../core/grid';
import type { Rng } from '../core/rng';
import type { Simulation } from '../core/sim';
import type { CreatureKey } from '../data/creatures';
import type { Carriers } from './carriers';
import type { Creature } from './creature';
import type { Effects } from './effects';
import type { Pouch } from './harvest';
import type { Player } from './player';
import type { Wand } from './wand';

export type MessageKind = 'info' | 'warn' | 'fizzle';

/** What the game systems (casting, carriers, creatures) see of the game. */
export interface GameContext {
  readonly tick: number;
  readonly grid: Grid;
  readonly sim: Simulation;
  readonly rng: Rng;
  readonly player: Player;
  readonly pouch: Pouch;
  readonly wand: Wand;
  readonly creatures: Creature[];
  readonly carriers: Carriers;
  readonly effects: Effects;
  say(text: string, kind: MessageKind): void;
  spawnCreature(key: CreatureKey, x: number, y: number, generation?: number): Creature;
}
