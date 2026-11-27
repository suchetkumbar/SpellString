/**
 * Material definitions. Ids are stable (they index typed arrays and will be
 * saved), so append new materials; never renumber.
 */
export type Behavior = 'empty' | 'static' | 'powder' | 'liquid' | 'gas' | 'fire';

export interface MaterialDef {
  readonly id: number;
  readonly key: MaterialKey;
  readonly name: string;
  readonly glyph: string;
  /** Base color; cells vary brightness around it. */
  readonly color: string;
  /**
   * Extra color bands, used by the renderer for state-dependent color
   * (fire: fresh -> dying). Band 0 is `color`.
   */
  readonly bands?: readonly string[];
  /** Water-like shimmer when drawn. */
  readonly shimmer?: boolean;
  /** Occasional bright glints (gold, ice). */
  readonly glint?: boolean;
  /** Gives off light: drawn into the glow layer with this color. */
  readonly glow?: string;
  readonly behavior: Behavior;
  /**
   * Relative weight. Powders sink through lighter liquids, heavier liquids sink
   * below lighter ones, and lighter gases rise through heavier gases.
   */
  readonly density: number;
  /** Liquids: how many cells sideways a cell may flow per tick. */
  readonly dispersion?: number;
  /** Fire and gases: lifetime in ticks [min, max]. When it runs out, the material's decay reaction fires. */
  readonly life?: readonly [number, number];
  /** Harvest speed in cells per second (hold right click). Loose matter is fast; solids are slow, which lets you dig. */
  readonly harvestRate: number;
  /** Explosions shatter this material (wood, ice, sand) instead of leaving it standing. */
  readonly brittle?: boolean;
  /** Harvested into the wallet, with its own (large) cap: gold. */
  readonly currency?: boolean;
  /** Cells a spell releases per glyph of this material, if not the usual burst (gold: a few nuggets, so a gold shot really spends gold). */
  readonly burstCells?: number;
}

export const MAT = {
  empty: 0,
  rock: 1,
  sand: 2,
  water: 3,
  fire: 4,
  oil: 5,
  wood: 6,
  steam: 7,
  smoke: 8,
  acid: 9,
  ice: 10,
  gunpowder: 11,
  gold: 12,
} as const;

export type MaterialKey = keyof typeof MAT;

export const MATERIALS: readonly MaterialDef[] = [
  { id: MAT.empty, key: 'empty', name: 'empty', glyph: ' ', color: '#000000', behavior: 'empty', density: 0, harvestRate: 0 },
  {
    id: MAT.rock, key: 'rock', name: 'rock', glyph: '#', color: '#5a6170',
    behavior: 'static', density: 100, harvestRate: 2.5,
  },
  {
    id: MAT.sand, key: 'sand', name: 'sand', glyph: '.', color: '#d9b56c',
    behavior: 'powder', density: 20, harvestRate: 30, brittle: true,
  },
  {
    id: MAT.water, key: 'water', name: 'water', glyph: '~', color: '#3d8bfd', shimmer: true,
    behavior: 'liquid', density: 10, dispersion: 5, harvestRate: 40,
  },
  {
    id: MAT.fire, key: 'fire', name: 'fire', glyph: '^', color: '#ffd23f', bands: ['#ff9a1f', '#e8401c'], glow: '#ff8a1f',
    behavior: 'fire', density: 0, life: [60, 120], harvestRate: 45,
  },
  {
    id: MAT.oil, key: 'oil', name: 'oil', glyph: '=', color: '#8a4f8e', shimmer: true,
    behavior: 'liquid', density: 8, dispersion: 3, harvestRate: 30,
  },
  {
    id: MAT.wood, key: 'wood', name: 'wood', glyph: '|', color: '#8b5a2b',
    behavior: 'static', density: 100, harvestRate: 5, brittle: true,
  },
  {
    id: MAT.steam, key: 'steam', name: 'steam', glyph: '"', color: '#cfd8e3',
    behavior: 'gas', density: 0.2, life: [200, 340], harvestRate: 30,
  },
  {
    id: MAT.smoke, key: 'smoke', name: 'smoke', glyph: "'", color: '#5c5c66',
    behavior: 'gas', density: 0.4, life: [90, 200], harvestRate: 30,
  },
  // Milestone 7.
  {
    // Heavier than water. Each cell has a few bites of rock, wood or ice in it (see reactions).
    id: MAT.acid, key: 'acid', name: 'acid', glyph: '%', color: '#9be22d', shimmer: true, glow: '#7fd01c',
    behavior: 'liquid', density: 12, dispersion: 3, harvestRate: 25,
  },
  {
    id: MAT.ice, key: 'ice', name: 'ice', glyph: '*', color: '#a8e6ff', glint: true,
    behavior: 'static', density: 100, harvestRate: 6, brittle: true,
  },
  {
    id: MAT.gunpowder, key: 'gunpowder', name: 'gunpowder', glyph: ':', color: '#8f8f8f',
    behavior: 'powder', density: 18, harvestRate: 25,
  },
  {
    // The heaviest powder. Harvested into the wallet; spent as a heavy shot when written into a spell.
    id: MAT.gold, key: 'gold', name: 'gold', glyph: '$', color: '#e8b923', glint: true,
    behavior: 'powder', density: 30, harvestRate: 20, currency: true, burstCells: 3,
  },
];

/** Glyph -> material id. Space is empty. */
export const MATERIAL_BY_GLYPH: ReadonlyMap<string, number> = new Map(MATERIALS.map((m) => [m.glyph, m.id]));

export function materialDef(id: number): MaterialDef | undefined {
  return MATERIALS[id];
}
