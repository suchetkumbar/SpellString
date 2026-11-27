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
    ],
    pools: [{ material: 'water', count: 6, maxCells: 260 }],
    piles: [{ material: 'sand', count: 8, height: [2, 5] }],
    planks: { count: 8, length: [6, 14] },
    vents: 0,
    creatures: { bat: 3, slime: 2 },
    budget: { base: 14, perDepth: 4 },
    chests: 2,
    chestLoot: ['water', 'sand', 'oil', 'fire', 'wood'],
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
    ],
    pools: [
      { material: 'oil', count: 5, maxCells: 600 },
      { material: 'water', count: 2, maxCells: 200 },
    ],
    piles: [{ material: 'sand', count: 3, height: [2, 4] }],
    planks: { count: 10, length: [8, 18] },
    vents: 4,
    creatures: { toad: 3, imp: 2, bat: 1 },
    budget: { base: 18, perDepth: 4 },
    chests: 2,
    chestLoot: ['water', 'sand', 'oil', 'fire', 'steam'],
  },
];

/** Levels per biome. */
export const LEVELS_PER_BIOME = 2;
