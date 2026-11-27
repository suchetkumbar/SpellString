import { it } from 'vitest';
import { parseAscii } from '../../src/core/ascii';
import { loadAsciiLevel } from '../../src/core/level';
import { Simulation } from '../../src/core/sim';
import type { Grid } from '../../src/core/grid';
import { MATERIAL_BY_GLYPH, MATERIALS } from '../../src/data/materials';
import { REACTIONS } from '../../src/data/reactions';

/**
 * ASCII scenario harness: build a world from an ASCII grid, run N ticks with a
 * fixed seed, then assert on an exact snapshot or on properties.
 */
export class World {
  readonly grid: Grid;
  readonly sim: Simulation;

  constructor(ascii: string, seed = 1) {
    this.grid = loadAsciiLevel(ascii, seed).grid;
    this.sim = new Simulation(this.grid, seed);
  }

  get width(): number {
    return this.grid.width;
  }

  get height(): number {
    return this.grid.height;
  }

  step(ticks = 1): this {
    for (let t = 0; t < ticks; t++) this.sim.step();
    return this;
  }

  /** Glyph at (x, y); ' ' for empty, '#' outside the grid. */
  at(x: number, y: number): string {
    const m = this.grid.get(x, y);
    return MATERIALS[m]?.glyph ?? '#';
  }

  count(glyph: string): number {
    return this.grid.count(idOf(glyph));
  }

  /** All cells holding `glyph`, in row-major order. */
  find(glyph: string): { x: number; y: number }[] {
    const id = idOf(glyph);
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) if (this.grid.get(x, y) === id) out.push({ x, y });
    }
    return out;
  }

  /** Topmost row containing `glyph` within columns [x0, x1], or -1. */
  top(glyph: string, x0 = 0, x1 = this.width - 1): number {
    const id = idOf(glyph);
    for (let y = 0; y < this.height; y++) {
      for (let x = x0; x <= x1; x++) if (this.grid.get(x, y) === id) return y;
    }
    return -1;
  }

  /** Number of times a reaction (by id) has fired. */
  reactions(id: string): number {
    const i = REACTIONS.findIndex((r) => r.id === id);
    if (i < 0) throw new Error(`Unknown reaction id '${id}'`);
    return this.sim.reactionCounts[i] ?? 0;
  }

  toAscii(): string {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) row += this.at(x, y);
      rows.push(row.replace(/\s+$/, ''));
    }
    return rows.join('\n');
  }

  /** Stable hash of the full grid state (materials and lifetimes). */
  hash(): number {
    let h = 0x811c9dc5;
    const { mat, life } = this.grid;
    for (let i = 0; i < mat.length; i++) {
      h = Math.imul(h ^ (mat[i] as number), 0x01000193);
      h = Math.imul(h ^ (life[i] as number), 0x01000193);
    }
    return h >>> 0;
  }
}

function idOf(glyph: string): number {
  const id = MATERIAL_BY_GLYPH.get(glyph);
  if (id === undefined) throw new Error(`Unknown material glyph '${glyph}'`);
  return id;
}

/** Normalizes an ASCII block the same way the loader does, for snapshot comparison. */
export function normalizeAscii(text: string): string {
  return parseAscii(text).rows.map((r) => r.replace(/\s+$/, '')).join('\n');
}

export interface ScenarioSpec {
  seed?: number;
  before: string;
  ticks: number;
  /** Exact expected grid after `ticks`. */
  after?: string;
  /** Property check after `ticks`. Return false (or throw) to fail. */
  expect?: (w: World) => boolean | void;
}

/** Registers a Vitest case for an ASCII scenario. */
export function scenario(name: string, spec: ScenarioSpec): void {
  it(name, () => {
    const w = new World(spec.before, spec.seed ?? 1).step(spec.ticks);
    if (spec.after !== undefined) {
      const actual = w.toAscii();
      const expected = normalizeAscii(spec.after);
      if (actual !== expected) {
        throw new Error(`Snapshot mismatch after ${spec.ticks} ticks.\n--- expected\n${expected}\n--- actual\n${actual}`);
      }
    }
    if (spec.expect && spec.expect(w) === false) {
      throw new Error(`Property check failed after ${spec.ticks} ticks:\n${w.toAscii()}`);
    }
  });
}
