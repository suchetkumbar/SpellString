/**
 * Light meta-progression: what you've discovered (in the Codex) opens up new
 * shrine offers and starting wands. Never raw stat boosts: an unlock adds
 * options, not power.
 */

export type DiscoveryKind = 'reaction' | 'material' | 'creature' | 'glyph';

/** What an unlock needs: at least this many discoveries of each kind, and these specific ones (`kind:id`). */
export interface UnlockRequirement {
  readonly reactions?: number;
  readonly materials?: number;
  readonly creatures?: number;
  readonly glyphs?: number;
  readonly ids?: readonly string[];
}

export interface UnlockDef {
  readonly id: string;
  readonly title: string;
  /** What it gives, for the Codex screen. */
  readonly text: string;
  /** How to earn it, for the Codex screen. */
  readonly hint: string;
  readonly requires: UnlockRequirement;
  /** Shrines may offer this glyph. */
  readonly shrineGlyph?: string;
  /** This starting wand can be chosen on the title screen. */
  readonly startingWand?: string;
}

export const UNLOCKS: readonly UnlockDef[] = [
  {
    id: 'glyph-trigger',
    title: '! trigger',
    text: 'Shrines may offer ! (cast the rest from the impact point).',
    hint: 'discover 6 reactions',
    requires: { reactions: 6 },
    shrineGlyph: '!',
  },
  {
    id: 'glyph-chaos',
    title: '? chaos',
    text: 'Shrines may offer ? (a random matter glyph you hold).',
    hint: 'discover 10 materials',
    requires: { materials: 10 },
    shrineGlyph: '?',
  },
  {
    id: 'glyph-loop',
    title: '[ ]n loop',
    text: 'Shrines may offer [ ] (repeat casts n times).',
    hint: 'discover 10 reactions',
    requires: { reactions: 10 },
    shrineGlyph: '[',
  },
  {
    id: 'wand-lobber',
    title: "Lobber's wand",
    text: 'Start a run knowing ) as well as >.',
    hint: 'meet 3 kinds of creature',
    requires: { creatures: 3 },
    startingWand: 'lobber',
  },
  {
    id: 'wand-splitter',
    title: "Splitter's wand",
    text: 'Start a run knowing + as well as >.',
    hint: 'discover 5 reactions',
    requires: { reactions: 5 },
    startingWand: 'splitter',
  },
  {
    id: 'wand-sapper',
    title: "Sapper's wand",
    text: 'Start a run knowing _ (mine) as well as >.',
    hint: 'see gunpowder explode',
    requires: { ids: ['reaction:fire+gunpowder'] },
    startingWand: 'sapper',
  },
];

/** Glyphs shrines always offer; the rest come from unlocks. */
export const BASE_SHRINE_GLYPHS: readonly string[] = [')', '+', '@', '_'];

/** Starting wands: which glyphs the run starts knowing, and the spell written in the wand. Same stats for all. */
export interface StartingWandDef {
  readonly id: string;
  readonly name: string;
  readonly glyphs: readonly string[];
  readonly spell: string;
}

export const STARTING_WANDS: readonly StartingWandDef[] = [
  { id: 'plain', name: 'Plain wand', glyphs: ['>'], spell: '>' },
  { id: 'lobber', name: "Lobber's wand", glyphs: ['>', ')'], spell: ')' },
  { id: 'splitter', name: "Splitter's wand", glyphs: ['>', '+'], spell: '+>' },
  { id: 'sapper', name: "Sapper's wand", glyphs: ['>', '_'], spell: '_' },
];
