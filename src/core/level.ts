import { parseAscii } from './ascii';
import { Grid } from './grid';
import { MAT, MATERIAL_BY_GLYPH } from '../data/materials';
import { CHEST_MARKER, EXIT_MARKER, SPAWN_MARKER, VENT_MARKER } from '../data/glyphs';
import { CREATURE_BY_GLYPH, type CreatureKey } from '../data/creatures';

export interface CellPos {
  readonly x: number;
  readonly y: number;
}

export interface CreatureSpawn extends CellPos {
  readonly key: CreatureKey;
}

/** A fire vent: a floor strip at row `y` (cells x .. x+w-1) feeding a gate of fire `h` cells tall above it. */
export interface VentSpec {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Everything a level starts with, from an ASCII map or the generator. */
export interface LevelLayout {
  readonly grid: Grid;
  /** Spawn cell (from the `@` marker), or the map center if there is none. */
  readonly spawn: CellPos;
  /** Exit portal cell, if the level has one. */
  readonly exit: CellPos | null;
  readonly chests: readonly CellPos[];
  readonly creatures: readonly CreatureSpawn[];
  readonly vents: readonly VentSpec[];
}

/** Tallest fire gate a vent marker makes. */
const MAX_VENT_HEIGHT = 6;

/**
 * Builds a level from an ASCII map. Material glyphs become cells; `@` marks
 * the spawn, `O` the exit portal, `&` a glyph chest, creature letters
 * (b s i t G) place creatures, and a run of `V` is a fire vent in the floor
 * (rock with a fire gate above it).
 */
export function loadAsciiLevel(text: string, variantSeed = 0): LevelLayout {
  const map = parseAscii(text);
  const grid = new Grid(map.width, map.height, variantSeed);
  let spawn: CellPos | null = null;
  let exit: CellPos | null = null;
  const chests: CellPos[] = [];
  const creatures: CreatureSpawn[] = [];
  const ventCells: CellPos[] = [];

  for (let y = 0; y < map.height; y++) {
    const row = map.rows[y] as string;
    for (let x = 0; x < map.width; x++) {
      const ch = row[x] as string;
      const where = `line ${y + 1}, column ${x + 1}`;
      if (ch === SPAWN_MARKER) {
        if (spawn) throw new Error(`ASCII map has more than one spawn '@' (${where})`);
        spawn = { x, y };
        continue;
      }
      if (ch === EXIT_MARKER) {
        if (exit) throw new Error(`ASCII map has more than one exit '${EXIT_MARKER}' (${where})`);
        exit = { x, y };
        continue;
      }
      if (ch === CHEST_MARKER) {
        chests.push({ x, y });
        continue;
      }
      if (ch === VENT_MARKER) {
        grid.set(x, y, MAT.rock);
        ventCells.push({ x, y });
        continue;
      }
      const creature = CREATURE_BY_GLYPH.get(ch);
      if (creature) {
        creatures.push({ key: creature.key, x, y });
        continue;
      }
      const id = MATERIAL_BY_GLYPH.get(ch);
      if (id === undefined) throw new Error(`Unknown glyph '${ch}' in ASCII map at ${where}`);
      if (id !== 0) grid.set(x, y, id);
    }
  }

  // Runs of V in a row are one vent; its gate rises through the open cells above, up to a cap.
  const vents: VentSpec[] = [];
  for (const c of ventCells) {
    const prev = vents[vents.length - 1];
    if (prev && prev.y === c.y && prev.x + prev.w === c.x) {
      vents[vents.length - 1] = { ...prev, w: prev.w + 1 };
    } else {
      vents.push({ x: c.x, y: c.y, w: 1, h: 0 });
    }
  }
  const sized = vents.map((v) => {
    let h = 0;
    while (h < MAX_VENT_HEIGHT && v.y - h - 1 >= 0 && grid.get(v.x, v.y - h - 1) === MAT.empty) h++;
    return { ...v, h };
  });

  return {
    grid,
    spawn: spawn ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) },
    exit,
    chests,
    creatures,
    vents: sized,
  };
}
