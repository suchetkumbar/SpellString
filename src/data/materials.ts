/**
 * Material definitions. Ids are stable (they index typed arrays and will be
 * saved), so append new materials; never renumber.
 */
export type Behavior = 'empty' | 'static' | 'powder' | 'liquid' | 'gas' | 'fire';

export interface MaterialDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly glyph: string;
  /** Base color; cells vary brightness around it. */
  readonly color: string;
  readonly behavior: Behavior;
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
  { id: MAT.empty, key: 'empty', name: 'empty', glyph: ' ', color: '#000000', behavior: 'empty' },
  { id: MAT.rock, key: 'rock', name: 'rock', glyph: '#', color: '#5a6170', behavior: 'static' },
  { id: MAT.sand, key: 'sand', name: 'sand', glyph: '.', color: '#d9b56c', behavior: 'powder' },
  { id: MAT.water, key: 'water', name: 'water', glyph: '~', color: '#3d8bfd', behavior: 'liquid' },
  { id: MAT.fire, key: 'fire', name: 'fire', glyph: '^', color: '#ffb020', behavior: 'fire' },
  { id: MAT.oil, key: 'oil', name: 'oil', glyph: '=', color: '#6b3f6e', behavior: 'liquid' },
  { id: MAT.wood, key: 'wood', name: 'wood', glyph: '|', color: '#8b5a2b', behavior: 'static' },
  { id: MAT.steam, key: 'steam', name: 'steam', glyph: '"', color: '#cfd8e3', behavior: 'gas' },
  { id: MAT.smoke, key: 'smoke', name: 'smoke', glyph: "'", color: '#4a4a52', behavior: 'gas' },
];

/** Glyph -> material id. Space is empty. */
export const MATERIAL_BY_GLYPH: ReadonlyMap<string, number> = new Map(MATERIALS.map((m) => [m.glyph, m.id]));

export function materialDef(id: number): MaterialDef | undefined {
  return MATERIALS[id];
}
