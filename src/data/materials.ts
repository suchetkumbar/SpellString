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
    behavior: 'powder', density: 20, harvestRate: 30,
  },
  {
    id: MAT.water, key: 'water', name: 'water', glyph: '~', color: '#3d8bfd', shimmer: true,
    behavior: 'liquid', density: 10, dispersion: 5, harvestRate: 40,
  },
  {
    id: MAT.fire, key: 'fire', name: 'fire', glyph: '^', color: '#ffd23f', bands: ['#ff9a1f', '#e8401c'],
    behavior: 'fire', density: 0, life: [60, 120], harvestRate: 45,
  },
  {
    id: MAT.oil, key: 'oil', name: 'oil', glyph: '=', color: '#8a4f8e',
    behavior: 'liquid', density: 8, dispersion: 3, harvestRate: 30,
  },
  {
    id: MAT.wood, key: 'wood', name: 'wood', glyph: '|', color: '#8b5a2b',
    behavior: 'static', density: 100, harvestRate: 5,
  },
  {
    id: MAT.steam, key: 'steam', name: 'steam', glyph: '"', color: '#cfd8e3',
    behavior: 'gas', density: 0.2, life: [200, 340], harvestRate: 30,
  },
  {
    id: MAT.smoke, key: 'smoke', name: 'smoke', glyph: "'", color: '#5c5c66',
    behavior: 'gas', density: 0.4, life: [90, 200], harvestRate: 30,
  },
];

/** Glyph -> material id. Space is empty. */
export const MATERIAL_BY_GLYPH: ReadonlyMap<string, number> = new Map(MATERIALS.map((m) => [m.glyph, m.id]));

export function materialDef(id: number): MaterialDef | undefined {
  return MATERIALS[id];
}
