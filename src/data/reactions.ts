import type { MaterialKey } from './materials';

/**
 * Data-driven chemistry. Every reaction has a stable id so the Codex (M8)
 * can record discoveries.
 *
 * contact: checked from each `a` cell against its 4 neighbors, once per tick
 *          per neighbor, with probability `chance`. `aTo` / `bTo` replace the
 *          cells (omit to leave a cell unchanged). `aLife` / `bLife` set the new
 *          cell's lifetime in ticks (otherwise the material's default).
 *          `directions` limits where `b` may sit relative to `a` (default: any side).
 * decay:   fires when a cell's lifetime runs out; picks one outcome by weight.
 */
export interface ContactReaction {
  readonly kind: 'contact';
  readonly id: string;
  readonly a: MaterialKey;
  readonly b: MaterialKey;
  readonly chance: number;
  readonly aTo?: MaterialKey;
  readonly bTo?: MaterialKey;
  readonly aLife?: readonly [number, number];
  readonly bLife?: readonly [number, number];
  readonly directions?: readonly Direction[];
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface DecayReaction {
  readonly kind: 'decay';
  readonly id: string;
  readonly from: MaterialKey;
  readonly outcomes: readonly { readonly to: MaterialKey; readonly weight: number }[];
}

export type Reaction = ContactReaction | DecayReaction;

export const REACTIONS: readonly Reaction[] = [
  // Fire meets water: the fire is quenched into a puff of steam. Only water above
  // or beside a flame quenches it, so burning oil floating on a pool keeps burning.
  {
    kind: 'contact', id: 'fire+water', a: 'fire', b: 'water', chance: 0.3, aTo: 'steam',
    directions: ['up', 'left', 'right'],
  },
  // Oil ignites readily and burns fast, so fire races across an oil slick.
  { kind: 'contact', id: 'fire+oil', a: 'fire', b: 'oil', chance: 0.25, bTo: 'fire', bLife: [40, 80] },
  // Wood catches slowly but burns for a long time.
  { kind: 'contact', id: 'fire+wood', a: 'fire', b: 'wood', chance: 0.04, bTo: 'fire', bLife: [240, 420] },
  // Steam condenses back into water (some is lost as it cools).
  { kind: 'decay', id: 'steam>water', from: 'steam', outcomes: [{ to: 'water', weight: 0.75 }, { to: 'empty', weight: 0.25 }] },
  // Fire burns out, sometimes leaving smoke.
  { kind: 'decay', id: 'fire>smoke', from: 'fire', outcomes: [{ to: 'smoke', weight: 0.4 }, { to: 'empty', weight: 0.6 }] },
  // Smoke fades away.
  { kind: 'decay', id: 'smoke>empty', from: 'smoke', outcomes: [{ to: 'empty', weight: 1 }] },
];
