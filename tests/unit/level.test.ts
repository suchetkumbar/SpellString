import { describe, expect, it } from 'vitest';
import { parseAscii } from '../../src/core/ascii';
import { loadAsciiLevel } from '../../src/core/level';
import { MAT } from '../../src/data/materials';
import testRoom from '../../levels/test-room.txt?raw';

describe('ASCII maps', () => {
  it('strips indentation and blank edge lines, and pads rows', () => {
    const map = parseAscii(`
      ####
      # ~
      ##
    `);
    expect(map.width).toBe(4);
    expect(map.height).toBe(3);
    expect(map.rows).toEqual(['####', '# ~ ', '##  ']);
  });

  it('loads materials and the spawn marker', () => {
    const { grid, spawn } = loadAsciiLevel(`
      #####
      #@ ~#
      #.^=#
      #####
    `);
    expect(spawn).toEqual({ x: 1, y: 1 });
    expect(grid.get(1, 1)).toBe(MAT.empty);
    expect(grid.get(3, 1)).toBe(MAT.water);
    expect(grid.get(1, 2)).toBe(MAT.sand);
    expect(grid.get(2, 2)).toBe(MAT.fire);
    expect(grid.get(3, 2)).toBe(MAT.oil);
    expect(grid.count(MAT.rock)).toBe(14);
  });

  it('reports unknown glyphs with a position', () => {
    expect(() => loadAsciiLevel('#Q#')).toThrow(/'Q'.*line 1, column 2/);
  });

  it('rejects two spawns', () => {
    expect(() => loadAsciiLevel('@ @')).toThrow(/more than one spawn/);
  });

  it('gives each cell a deterministic color variant', () => {
    const a = loadAsciiLevel('####', 3).grid;
    const b = loadAsciiLevel('####', 3).grid;
    expect(Array.from(a.variant)).toEqual(Array.from(b.variant));
  });

  it('loads the M1 test room, which contains every starting material', () => {
    const { grid, spawn } = loadAsciiLevel(testRoom);
    expect(grid.width).toBeGreaterThan(100);
    expect(grid.get(spawn.x, spawn.y)).toBe(MAT.empty);
    for (const m of Object.values(MAT)) if (m !== MAT.empty) expect(grid.count(m)).toBeGreaterThan(0);
  });
});
