import type { CreatureKey } from './creatures';
import type { MaterialKey } from './materials';

/**
 * Biomes: how the level generator shapes and furnishes a level. Two levels per
 * biome; a run walks through them in order (Milestone 7 adds Frozen Vaults,
 * Milestone 10 the boss chamber).
 */
export interface BiomeDef {
  readonly key: string;
  readonly name: string;
  /** Level size in cells. */
  readonly width: number;
  readonly height: number;
  /** Cave shape: noise lattice spacing (bigger = bigger caverns) and the solid threshold (higher = more open). */
  readonly noiseScale: number;
  readonly solidThreshold: number;
  /** Cellular-automata smoothing passes. */
  readonly smoothing: number;
  /** Sealed pockets of material inside rock: they spill when you dig into them. */
  readonly pockets: readonly { readonly material: MaterialKey; readonly count: number; readonly radius: readonly [number, number] }[];
  /** Pools filled into floor basins. `maxCells` bounds each pool (lakes are big). */
  readonly pools: readonly { readonly material: MaterialKey; readonly count: number; readonly maxCells: number }[];
  /** Powder piles resting on floors. */
  readonly piles: readonly { readonly material: MaterialKey; readonly count: number; readonly height: readonly [number, number] }[];
  /** Wooden planks across open air (scaffolds and bridges), with posts down to the floor. */
  readonly planks: { readonly count: number; readonly length: readonly [number, number] };
  /** Fire vents in the floor: a fire gate that burns until doused with water. */
  readonly vents: number;
  /** Rock facing open air is crusted with this material, with this chance per cell (the Vaults' ice). */
  readonly crust?: { readonly material: MaterialKey; readonly chance: number };
  /** What the main route's bridges are made of. */
  readonly bridge: MaterialKey;
  /** Creature picks (weights) and the difficulty budget: base + perDepth * (depth - 1). */
  readonly creatures: Readonly<Partial<Record<CreatureKey, number>>>;
  readonly budget: { readonly base: number; readonly perDepth: number };
  /** Glyph chests per level and what they can hold. */
  readonly chests: number;
  readonly chestLoot: readonly MaterialKey[];
}

/** Difficulty cost of each creature, spent from a level's budget. */
export const CREATURE_COST: Readonly<Record<CreatureKey, number>> = {
  bat: 1,
  slime: 2,
  toad: 3,
  imp: 3,
  golem: 5,
};

export const BIOMES: readonly BiomeDef[] = [
  {
    key: 'hollows',
    name: 'Sandstone Hollows',
    width: 256,
    height: 144,
    noiseScale: 18,
    solidThreshold: 0.5,
    smoothing: 4,
    pockets: [
      { material: 'sand', count: 10, radius: [2, 4] },
      { material: 'water', count: 6, radius: [2, 4] },
      { material: 'gold', count: 4, radius: [1, 2] },
    ],
    pools: [{ material: 'water', count: 6, maxCells: 260 }],
    piles: [
      { material: 'sand', count: 8, height: [2, 5] },
      { material: 'gold', count: 3, height: [1, 2] },
    ],
    planks: { count: 8, length: [6, 14] },
    vents: 0,
    bridge: 'wood',
    creatures: { bat: 3, slime: 2 },
    budget: { base: 14, perDepth: 4 },
    chests: 2,
    chestLoot: ['water', 'sand', 'oil', 'fire', 'wood', 'gold'],
  },
  {
    key: 'tarpits',
    name: 'Tar Pits',
    width: 256,
    height: 144,
    noiseScale: 22,
    solidThreshold: 0.48,
    smoothing: 4,
    pockets: [
      { material: 'oil', count: 10, radius: [2, 5] },
      { material: 'water', count: 3, radius: [2, 3] },
      { material: 'gold', count: 5, radius: [1, 2] },
      { material: 'acid', count: 2, radius: [2, 3] },
    ],
    pools: [
      { material: 'oil', count: 5, maxCells: 600 },
      { material: 'water', count: 2, maxCells: 200 },
    ],
    piles: [
      { material: 'sand', count: 3, height: [2, 4] },
      { material: 'gold', count: 3, height: [1, 2] },
    ],
    planks: { count: 10, length: [8, 18] },
    vents: 4,
    bridge: 'wood',
    creatures: { toad: 3, imp: 2, bat: 1 },
    budget: { base: 18, perDepth: 4 },
    chests: 2,
    chestLoot: ['water', 'sand', 'oil', 'fire', 'steam', 'gold'],
  },
  {
    key: 'vaults',
    name: 'Frozen Vaults',
    width: 256,
    height: 144,
    noiseScale: 20,
    solidThreshold: 0.49,
    smoothing: 4,
    pockets: [
      { material: 'gunpowder', count: 9, radius: [2, 4] },
      { material: 'water', count: 5, radius: [2, 4] },
      { material: 'gold', count: 6, radius: [1, 2] },
      { material: 'acid', count: 3, radius: [2, 3] },
    ],
    pools: [{ material: 'water', count: 6, maxCells: 300 }],
    piles: [
      { material: 'gunpowder', count: 6, height: [2, 4] },
      { material: 'gold', count: 4, height: [1, 2] },
    ],
    planks: { count: 4, length: [6, 12] },
    vents: 0,
    crust: { material: 'ice', chance: 0.45 },
    bridge: 'ice',
    creatures: { golem: 2, imp: 2, bat: 1 },
    budget: { base: 20, perDepth: 4 },
    chests: 3,
    chestLoot: ['water', 'gunpowder', 'acid', 'fire', 'gold', 'ice'],
  },
];

/** Levels per biome. */
export const LEVELS_PER_BIOME = 2;
