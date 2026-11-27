import { parseAscii } from './ascii';
import { Grid } from './grid';
import { MATERIAL_BY_GLYPH } from '../data/materials';
import { SPAWN_MARKER } from '../data/glyphs';

export interface LoadedLevel {
  readonly grid: Grid;
  /** Spawn cell (from the `@` marker), or the map center if there is none. */
  readonly spawn: { readonly x: number; readonly y: number };
}

/** Builds a grid from an ASCII map. Material glyphs become cells; `@` marks the spawn. */
export function loadAsciiLevel(text: string, variantSeed = 0): LoadedLevel {
  const map = parseAscii(text);
  const grid = new Grid(map.width, map.height, variantSeed);
  let spawn: { x: number; y: number } | null = null;

  for (let y = 0; y < map.height; y++) {
    const row = map.rows[y] as string;
    for (let x = 0; x < map.width; x++) {
      const ch = row[x] as string;
      if (ch === SPAWN_MARKER) {
        if (spawn) throw new Error(`ASCII map has more than one spawn '@' (line ${y + 1}, column ${x + 1})`);
        spawn = { x, y };
        continue;
      }
      const id = MATERIAL_BY_GLYPH.get(ch);
      if (id === undefined) throw new Error(`Unknown glyph '${ch}' in ASCII map at line ${y + 1}, column ${x + 1}`);
      if (id !== 0) grid.set(x, y, id);
    }
  }
  return { grid, spawn: spawn ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) } };
}
