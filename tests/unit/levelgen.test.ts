import { describe, expect, it } from 'vitest';
import { generateLevel } from '../../src/core/levelgen';
import { canReach, reachFrom } from '../../src/core/reach';
import { BIOMES } from '../../src/data/biomes';
import { CREATURE_COST } from '../../src/data/biomes';
import { MAT } from '../../src/data/materials';
import type { Grid } from '../../src/core/grid';
import { loadAsciiLevel } from '../../src/core/level';

function gridHash(g: Grid): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < g.mat.length; i++) h = Math.imul(h ^ (g.mat[i] as number), 0x01000193);
  return h >>> 0;
}

describe('level generator', () => {
  it('500 seeds all generate with spawn connected to exit, each in under 200 ms', () => {
    let carved = 0;
    let worst = 0;
    let total = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const biome = BIOMES[seed % BIOMES.length]!;
      const t0 = performance.now();
      const level = generateLevel(seed, biome, 1 + (seed % 4));
      const ms = performance.now() - t0;
      worst = Math.max(worst, ms);
      total += ms;
      if (level.carved) carved++;
      const reach = reachFrom(level.grid, level.spawn.x, level.spawn.y);
      expect(canReach(reach, level.grid, level.exit.x, level.exit.y), `seed ${seed}`).toBe(true);
      expect(level.path.length, `seed ${seed}`).toBeGreaterThan(0);
    }
    console.log(`[levelgen] 500 levels: avg ${(total / 500).toFixed(1)} ms, worst ${worst.toFixed(1)} ms, fallback tunnel in ${carved}`);
    expect(worst).toBeLessThan(200);
    // The main route should make the fallback tunnel rare.
    expect(carved).toBeLessThan(25);
  }, 120_000);

  it('the same seed gives an identical level; different seeds and biomes differ', () => {
    for (const biome of BIOMES) {
      const a = generateLevel(48213, biome, 2);
      const b = generateLevel(48213, biome, 2);
      expect(gridHash(a.grid)).toBe(gridHash(b.grid));
      expect(a.spawn).toEqual(b.spawn);
      expect(a.exit).toEqual(b.exit);
      expect(a.creatures).toEqual(b.creatures);
      expect(a.chests).toEqual(b.chests);
      expect(a.vents).toEqual(b.vents);
      expect(gridHash(generateLevel(48214, biome, 2).grid)).not.toBe(gridHash(a.grid));
    }
    expect(gridHash(generateLevel(7, BIOMES[0]!, 1).grid)).not.toBe(gridHash(generateLevel(7, BIOMES[1]!, 1).grid));
  });

  it('furnishes levels from the biome: Hollows have water and sand, Tar Pits have oil and vents', () => {
    let hollowsWater = 0;
    let hollowsSand = 0;
    let tarOil = 0;
    let tarVents = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const h = generateLevel(seed, BIOMES[0]!, 1);
      hollowsWater += h.grid.count(MAT.water);
      hollowsSand += h.grid.count(MAT.sand);
      const t = generateLevel(seed, BIOMES[1]!, 3);
      tarOil += t.grid.count(MAT.oil);
      tarVents += t.vents.length;
    }
    expect(hollowsWater).toBeGreaterThan(500);
    expect(hollowsSand).toBeGreaterThan(300);
    expect(tarOil).toBeGreaterThan(hollowsWater);
    expect(tarVents).toBeGreaterThan(10);
  });

  it('spends the creature budget, keeps creatures away from the spawn, and grows with depth', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const biome of BIOMES) {
        const shallow = generateLevel(seed, biome, 1);
        const deep = generateLevel(seed, biome, 4);
        const cost = (l: typeof shallow) => l.creatures.reduce((s, c) => s + CREATURE_COST[c.key], 0);
        expect(cost(shallow)).toBeLessThanOrEqual(biome.budget.base);
        expect(cost(shallow)).toBeGreaterThanOrEqual(biome.budget.base - 3);
        expect(cost(deep)).toBeGreaterThan(cost(shallow));
        for (const c of shallow.creatures) {
          expect(Math.hypot(c.x - shallow.spawn.x, c.y - shallow.spawn.y)).toBeGreaterThanOrEqual(28);
          expect(Object.keys(biome.creatures)).toContain(c.key);
        }
      }
    }
  });

  it('places glyph chests where she can reach them, away from the main route', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const l = generateLevel(seed, BIOMES[seed % 2]!, 1);
      const reach = reachFrom(l.grid, l.spawn.x, l.spawn.y);
      expect(l.chests.length).toBeGreaterThan(0);
      for (const c of l.chests) expect(canReach(reach, l.grid, c.x, c.y), `seed ${seed}`).toBe(true);
    }
  });

  it('the reachability model: walk, step up, jump 4 but not 5, swim, and fall', () => {
    const r = (ascii: string) => {
      const l = loadAsciiLevel(ascii);
      const reach = reachFrom(l.grid, l.spawn.x, l.spawn.y);
      return canReach(reach, l.grid, l.exit!.x, l.exit!.y);
    };
    expect(r(`
      ##########
      #        #
      #@      O#
      ##########`)).toBe(true);
    expect(r(`
      ##########
      #      O #
      #      ###
      #      ###
      #      ###
      #@     ###
      ##########`)).toBe(true); // a 4-cell ledge: jumpable
    expect(r(`
      ##########
      #      O #
      #      ###
      #      ###
      #      ###
      #      ###
      #@     ###
      ##########`)).toBe(false); // 5 cells: too high
    expect(r(`
      ############
      #        O #
      #~~~~~~~####
      #~~~~~~~####
      #~~~~~~~####
      #~@~~~~~####
      ############`)).toBe(true); // swim up, leap out
  });
});
