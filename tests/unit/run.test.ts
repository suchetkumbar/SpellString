import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAsciiLevel } from '../../src/core/level';
import { canReach, reachFrom } from '../../src/core/reach';
import { dailySeed, dayKey, levelSeed, parseSeed } from '../../src/core/seeds';
import { BIOMES, LEVELS_PER_BIOME } from '../../src/data/biomes';
import { MAT } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';
import { Game, NO_INPUT, tickInput } from '../../src/game/game';
import { Run, applyUpgrade } from '../../src/game/run';
import { RunStats } from '../../src/game/stats';
import { Wand } from '../../src/game/wand';
import { WAND_UPGRADES } from '../../src/data/shrine';

const tutorial = readFileSync(new URL('../../levels/tutorial.txt', import.meta.url), 'utf8');
const testRoom = readFileSync(new URL('../../levels/test-room.txt', import.meta.url), 'utf8');
const LEVELS = { tutorial, testRoom };

/** Teleport the witch onto the exit portal and tick once. */
function reachExit(run: Run): void {
  const exit = run.game.features.portal!;
  run.game.player.body.x = exit.x + 0.5;
  run.game.player.body.y = exit.y + 0.5;
  run.step(NO_INPUT);
}

describe('seeds', () => {
  it('daily seeds are per UTC day, stable, and in range', () => {
    const a = dailySeed(new Date('2026-11-27T01:00:00Z'));
    expect(dailySeed(new Date('2026-11-27T23:59:00Z'))).toBe(a);
    expect(dailySeed(new Date('2026-11-28T00:00:01Z'))).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(999_999);
    expect(dayKey(new Date('2026-11-27T12:00:00Z'))).toBe('2026-11-27');
  });

  it('typed seeds: numbers as-is, text hashed, blank is none', () => {
    expect(parseSeed('48213')).toBe(48213);
    expect(parseSeed(' 7 ')).toBe(7);
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('witch')).toBe(parseSeed('witch'));
    expect(parseSeed('witch')).not.toBe(parseSeed('wytch'));
    expect(levelSeed(1, 1)).not.toBe(levelSeed(1, 2));
  });
});

describe('the run', () => {
  it('a seeded run generates the same levels', () => {
    const a = new Run(48213, 'run', LEVELS);
    const b = new Run(48213, 'run', LEVELS);
    expect(a.game.spawn).toEqual(b.game.spawn);
    expect(Array.from(a.game.grid.mat)).toEqual(Array.from(b.game.grid.mat));
  });

  it('descends through two biomes, two levels each, with a shrine between levels', () => {
    const run = new Run(5, 'run', LEVELS);
    expect(run.totalLevels).toBe(BIOMES.length * LEVELS_PER_BIOME);
    expect(run.place).toBe('Sandstone Hollows 1-1');
    const seen: string[] = [run.place];
    for (let level = 1; level < run.totalLevels; level++) {
      reachExit(run);
      expect(run.phase).toBe('shrine');
      expect(run.offers.length).toBe(3);
      run.choose(0);
      expect(run.phase).toBe('level');
      seen.push(run.place);
    }
    expect(seen).toEqual(['Sandstone Hollows 1-1', 'Sandstone Hollows 1-2', 'Tar Pits 2-1', 'Tar Pits 2-2']);
    reachExit(run);
    expect(run.phase).toBe('won');
  });

  it('carries HP, pouch, wand and glyphs to the next level; the shrine heals and gives a gift', () => {
    const run = new Run(9, 'run', LEVELS);
    const g1 = run.game;
    g1.pouch.add(MAT.water, 17);
    g1.player.hp = 40;
    expect(g1.wand.write('>~', g1.owns).ok).toBe(true);
    reachExit(run);
    const firstGlyph = run.offers.findIndex((o) => o.kind === 'glyph');
    expect(firstGlyph).toBeGreaterThanOrEqual(0); // there's always a new glyph while any are left
    const offer = run.offers[firstGlyph]!;
    run.choose(firstGlyph);
    const g2 = run.game;
    expect(g2).not.toBe(g1);
    expect(g2.player.hp).toBe(40 + TUNING.shrineHeal);
    expect(g2.pouch.count(MAT.water)).toBe(17);
    expect(g2.wand.spell.text).toBe('>~');
    expect(offer.kind === 'glyph' && g2.owns(offer.glyph)).toBe(true);
  });

  it('starts knowing only >, and the shrines teach ) and +', () => {
    const run = new Run(3, 'run', LEVELS);
    expect(run.game.owns('>')).toBe(true);
    expect(run.game.owns(')')).toBe(false);
    expect(run.game.owns('+')).toBe(false);
    const learned = new Set<string>();
    for (let k = 0; k < 2; k++) {
      reachExit(run);
      const i = run.offers.findIndex((o) => o.kind === 'glyph');
      const o = run.offers[i];
      if (o?.kind === 'glyph') learned.add(o.glyph);
      run.choose(i);
    }
    expect([...learned].sort()).toEqual([')', '+']);
    expect(run.game.owns(')') && run.game.owns('+')).toBe(true);
  });

  it('wand upgrades change the stats', () => {
    const w = new Wand();
    for (const u of WAND_UPGRADES) applyUpgrade(w, u);
    expect(w.stats.slots).toBe(TUNING.wandSlots + 1);
    expect(w.stats.maxMana).toBe(TUNING.wandMaxMana + 30);
    expect(w.stats.manaRegen).toBeCloseTo(TUNING.wandManaRegen * 1.4, 5);
    expect(w.stats.rechargeTicks).toBeLessThan(TUNING.wandRechargeTicks);
    // A 5-glyph spell now fits.
    expect(w.compile('>~~~~', () => true).ok).toBe(true);
  });

  it('death ends the run with a postcard: seed, depth, killer, best spell, reactions', () => {
    const run = new Run(48213, 'run', LEVELS);
    const g = run.game;
    g.stats.countCast('>');
    g.stats.countCast('+>^');
    g.stats.countKill('+>^');
    g.sim.reactionCounts[0] = 1;
    g.player.hp = 1;
    g.player.burning = 100;
    for (let t = 0; t < 30 && run.phase === 'level'; t++) run.step(NO_INPUT);
    expect(run.phase).toBe('dead');
    expect(run.postcard()).toBe(
      ['SPELLSTRING  seed 48213  depth 1/4', 'killed by: ^ (burning)', 'best spell: +>^   reactions found: 1'].join('\n'),
    );
  });

  it('"your own fire" when the witch dies in a fire she cast', () => {
    const g = Game.fromAscii(
      `
      ####################
      #                  #
      #  @     ##        #
      ####################`,
      1,
    );
    g.pouch.add(MAT.fire, 10);
    g.player.hp = 5;
    expect(g.wand.write('>^', g.owns).ok).toBe(true);
    g.step(tickInput({ cast: true, aimX: 9, aimY: 2.5 }));
    for (let t = 0; t < 400 && !g.player.dead; t++) g.step(tickInput({ moveX: 1, aimX: 9, aimY: 2.5 }));
    expect(g.player.dead).toBe(true);
    expect(g.player.killedBy?.text).toBe('your own fire');
  });

  it('best spell: most kills, else most casts', () => {
    const s = new RunStats();
    expect(s.bestSpell()).toBeNull();
    s.countCast('>');
    s.countCast('>');
    s.countCast('>~');
    expect(s.bestSpell()).toBe('>');
    s.countKill('>~');
    expect(s.bestSpell()).toBe('>~');
  });
});

describe('level features', () => {
  it('a glyph chest flies charges into the pouch when she walks into it', () => {
    const g = Game.fromAscii(`
      ############
      #          #
      # @   &    #
      ############`, 1, { chestLoot: ['water', 'sand'] });
    for (let t = 0; t < 120; t++) g.step(tickInput({ moveX: 1 }));
    expect(g.features.chests[0]!.opened).toBe(true);
    expect(g.pouch.count(MAT.water)).toBeGreaterThanOrEqual(TUNING.chestChargesMin);
    expect(g.pouch.count(MAT.sand)).toBeGreaterThanOrEqual(TUNING.chestChargesMin);
    expect(g.stats.chestsOpened).toBe(1);
  });

  it('a fire vent keeps its gate burning until water reaches its mouth', () => {
    const g = Game.fromAscii(`
      ##########
      #        #
      #        #
      #        #
      #@       #
      ####VV####`, 1);
    const vent = g.features.vents[0]!;
    expect(vent.spec).toEqual({ x: 4, y: 5, w: 2, h: 4 });
    for (let t = 0; t < 600; t++) g.step(NO_INPUT); // well past any fire cell's lifetime
    expect(vent.lit).toBe(true);
    let fire = 0;
    for (let y = 1; y < 5; y++) for (let x = 4; x < 6; x++) if (g.grid.get(x, y) === MAT.fire) fire++;
    expect(fire).toBeGreaterThan(2);
    g.sim.place(4, 4, MAT.water);
    g.step(NO_INPUT);
    expect(vent.lit).toBe(false);
    for (let t = 0; t < 400; t++) g.step(NO_INPUT);
    expect(g.grid.count(MAT.fire)).toBe(0);
  });

  it('touching the exit portal finishes the level', () => {
    const g = Game.fromAscii(`
      #########
      #       #
      # @   O #
      #########`, 1);
    for (let t = 0; t < 90 && !g.exitReached; t++) g.step(tickInput({ moveX: 1 }));
    expect(g.exitReached).toBe(true);
  });
});

describe('the tutorial', () => {
  const level = loadAsciiLevel(tutorial);

  it('loads, with a spawn, an exit, a fire gate, a chest, a pool and a sand pile', () => {
    expect(level.exit).not.toBeNull();
    expect(level.vents).toHaveLength(1);
    expect(level.vents[0]!.h).toBeGreaterThanOrEqual(5);
    expect(level.chests).toHaveLength(1);
    expect(level.grid.count(MAT.water)).toBeGreaterThan(10);
    expect(level.grid.count(MAT.sand)).toBeGreaterThanOrEqual(16);
    const run = new Run(1, 'tutorial', LEVELS);
    expect(run.place).toBe('Tutorial');
    expect(run.game.features.vents[0]!.lit).toBe(true);
  });

  it('the pit cannot be crossed without filling it, and can be once filled with sand', () => {
    const before = reachFrom(level.grid, level.spawn.x, level.spawn.y);
    expect(canReach(before, level.grid, level.exit!.x, level.exit!.y)).toBe(false);
    // Falling in is never a trap: from the pit floor she can climb back out on the near side.
    const fromPit = reachFrom(level.grid, 64, 17);
    expect(canReach(fromPit, level.grid, 55, 11)).toBe(true);
    // Fill the bottom four rows with sand (one >.3 is 36 cells): now she can cross.
    for (let y = 14; y <= 17; y++) for (let x = 60; x <= 68; x++) if (level.grid.get(x, y) === MAT.empty) level.grid.set(x, y, MAT.sand);
    const after = reachFrom(level.grid, level.spawn.x, level.spawn.y);
    expect(canReach(after, level.grid, level.exit!.x, level.exit!.y)).toBe(true);
  });

  it('the gate can only be passed through the fire (no way over it)', () => {
    const l = loadAsciiLevel(tutorial);
    const v = l.vents[0]!;
    // Every cell of the gate column is either the gate or rock, from floor to ceiling.
    for (let y = 5; y < v.y; y++) {
      const m = l.grid.get(v.x + 1, y);
      expect(y >= v.y - v.h || m === MAT.rock, `row ${y}`).toBe(true);
    }
  });
});
