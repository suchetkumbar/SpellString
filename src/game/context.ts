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

/**
 * Things that happened this tick, for the feel layer (sound, screen shake,
 * hit-stop). Purely informational: nothing in the simulation reads them.
 */
export type GameEvent =
  | { readonly kind: 'cast'; readonly delivery: string }
  | { readonly kind: 'impact'; readonly x: number; readonly y: number; readonly materials: readonly number[]; readonly kinetic: boolean }
  | { readonly kind: 'splash'; readonly x: number; readonly y: number }
  | { readonly kind: 'explode'; readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: 'hurt'; readonly amount: number }
  | { readonly kind: 'hit'; readonly x: number; readonly y: number; readonly amount: number }
  | { readonly kind: 'kill'; readonly x: number; readonly y: number }
  | { readonly kind: 'death' }
  | { readonly kind: 'fizzle' }
  | { readonly kind: 'sizzle'; readonly amount: number }
  | { readonly kind: 'discover' }
  | { readonly kind: 'chest' }
  | { readonly kind: 'portal' };

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
  /** Report something for the feel layer (sound, shake). */
  emit(e: GameEvent): void;
  spawnCreature(key: CreatureKey, x: number, y: number, generation?: number): Creature;
  /** The witch's own carrier burst at (x, y): burns nearby count as her own fire or steam. */
  noteOwnBurst(x: number, y: number, payload: readonly number[]): void;
  /** `!`: fire these casts from (x, y) along `angle` (charges are spent now, fizzles as usual). */
  castFrom(casts: readonly PlannedCast[], x: number, y: number, angle: number, spell: string | null): void;
}
