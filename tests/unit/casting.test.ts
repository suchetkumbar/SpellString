import { describe, expect, it } from 'vitest';
import { Game, NO_INPUT, tickInput, type TickInput } from '../../src/game/game';
import { MAT, MATERIAL_BY_GLYPH } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';
import { releaseBurst } from '../../src/game/release';
import { Rng } from '../../src/core/rng';
import { World } from '../helpers/scenario';
import { REACTIONS } from '../../src/data/reactions';

function run(g: Game, ticks: number, input: TickInput = NO_INPUT): Game {
  for (let t = 0; t < ticks; t++) g.step(input);
  return g;
}

function id(glyph: string): number {
  return MATERIAL_BY_GLYPH.get(glyph)!;
}

/** A game with charges in the pouch and a spell in the wand, the witch settled on the floor. */
function setup(level: string, spell: string, charges: Record<string, number> = {}, ownedEmpty: string[] = []): Game {
  const g = Game.fromAscii(level, 1);
  // Runs start knowing only >; these tests use ) and + as if a shrine had taught them.
  g.known.add(')');
  g.known.add('+');
  for (const glyph of ownedEmpty) g.pouch.seen[id(glyph)] = 1;
  for (const [glyph, n] of Object.entries(charges)) {
    g.pouch.seen[id(glyph)] = 1;
    g.pouch.add(id(glyph), n);
  }
  const c = g.wand.write(spell, g.owns);
  expect(c.parse.errors, `'${spell}'`).toEqual([]);
  run(g, 20);
  return g;
}

/** Press cast for one tick aimed at (x, y), then let go and run `after` ticks. */
function click(g: Game, x: number, y: number, after = 0): Game {
  g.step(tickInput({ cast: true, aimX: x, aimY: y }));
  return run(g, after, tickInput({ aimX: x, aimY: y }));
}

const ROOM = `
  ########################################
  #                                      #
  #                                      #
  #                                      #
  #                                      #
  #                                      #
  #  @                                   #
  ########################################`;

describe('the wand', () => {
  it('starts with 4 slots and the spell >', () => {
    const g = Game.fromAscii(ROOM, 1);
    expect(g.wand.stats.slots).toBe(4);
    expect(g.wand.spell.text).toBe('>');
    expect(g.wand.spell.ok).toBe(true);
  });

  it('only writes spells that compile with owned glyphs', () => {
    const g = Game.fromAscii(ROOM, 1);
    expect(g.wand.write('>~', g.owns).ok).toBe(false); // never harvested water
    expect(g.wand.spell.text).toBe('>');
    g.pouch.add(MAT.water, 1);
    expect(g.wand.write('>~', g.owns).ok).toBe(true);
    expect(g.wand.spell.text).toBe('>~');
    expect(g.wand.write('>~~~~', g.owns).parse.errors[0]!.code).toBe('tooLong');
    expect(g.wand.write('_~', g.owns).parse.errors[0]!.code).toBe('unownedGlyph'); // M7 glyph
  });

  it('owns digits always, starting glyphs, and matter once harvested', () => {
    const g = Game.fromAscii(ROOM, 1);
    for (const ch of ['>', '2', '9']) expect(g.owns(ch), ch).toBe(true);
    // Everything but > is learned at Glyph Shrines.
    for (const ch of [')', '+', '~', '^', '_', '@', '!', '?', '[', 'k']) expect(g.owns(ch), ch).toBe(false);
    g.known.add(')');
    g.known.add('_');
    expect(g.owns(')')).toBe(true);
    expect(g.owns('_')).toBe(true);
    expect(g.owns('[')).toBe(false); // not learned
    g.pouch.add(MAT.fire, 1);
    g.pouch.spend(MAT.fire);
    expect(g.owns('^')).toBe(true); // still owned with no charges left
  });
});

describe('casting', () => {
  it('a click spends mana and fires a bolt toward the cursor', () => {
    const g = setup(ROOM, '>');
    expect(g.wand.mana).toBe(g.wand.stats.maxMana);
    click(g, 30, g.player.y);
    expect(g.wand.mana).toBe(g.wand.stats.maxMana - TUNING.spellCost.delivery);
    expect(g.carriers.list).toHaveLength(1);
    const c = g.carriers.list[0]!;
    expect(c.kinetic).toBe(true);
    expect(c.vx).toBeCloseTo(TUNING.boltSpeed, 0);
    expect(Math.abs(c.vy)).toBeLessThan(1);
  });

  it('holding the button repeats only as fast as the wand recharges', () => {
    const g = setup(ROOM, '>');
    const hold = tickInput({ cast: true, aimX: 30, aimY: 6 });
    const fired: number[] = [];
    let before = 0;
    for (let t = 0; t < 60; t++) {
      g.step(hold);
      // Bolts hit the far wall within the second, so count launches by mana drops.
      if (g.wand.mana < before - 1) fired.push(t);
      before = g.wand.mana;
    }
    expect(fired.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < fired.length; i++) expect(fired[i]! - fired[i - 1]!).toBe(TUNING.wandRechargeTicks);
  });

  it('casts in one spell fire a few ticks apart', () => {
    const g = setup(ROOM, '>>>>');
    g.step(tickInput({ cast: true, aimX: 30, aimY: 6 }));
    expect(g.carriers.list).toHaveLength(1);
    run(g, TUNING.wandCastDelayTicks, tickInput({ aimX: 30, aimY: 6 }));
    expect(g.carriers.list).toHaveLength(2);
    run(g, TUNING.wandCastDelayTicks * 2, tickInput({ aimX: 30, aimY: 6 }));
    expect(g.carriers.list).toHaveLength(4);
    expect(g.wand.queue).toHaveLength(0);
    expect(g.wand.recharge).toBeGreaterThan(0);
  });

  it('refuses to cast without enough mana, and says so', () => {
    const g = setup(ROOM, '>');
    g.wand.mana = 2;
    click(g, 30, 6);
    expect(g.carriers.list).toHaveLength(0);
    expect(g.messages.at(-1)?.text).toContain('Not enough mana');
  });

  it('+>~ fans out three carriers and spends three water', () => {
    const g = setup(ROOM, '+>~', { '~': 10 });
    click(g, 30, 6);
    expect(g.carriers.list).toHaveLength(3);
    expect(g.pouch.count(MAT.water)).toBe(7);
    const angles = g.carriers.list.map((c) => Math.atan2(c.vy, c.vx)).sort((a, b) => a - b);
    const step = (TUNING.splitSpreadDeg * Math.PI) / 180;
    expect(angles[1]! - angles[0]!).toBeCloseTo(step, 3);
    expect(angles[2]! - angles[1]!).toBeCloseTo(step, 3);
  });

  it('a glyph with no charges fizzles, clearly, and the rest of the spell still works', () => {
    const g = setup(ROOM, '>~^', { '^': 5 }, ['~']); // water owned, but no charges
    const fire0 = g.grid.count(MAT.fire);
    click(g, 30, 6, 70);
    expect(g.pouch.count(MAT.fire)).toBe(4);
    expect(g.grid.count(MAT.water)).toBe(0);
    expect(g.grid.count(MAT.fire) + g.grid.count(MAT.smoke)).toBeGreaterThan(fire0);
    expect(g.messages.some((m) => m.kind === 'fizzle' && m.text.includes('~'))).toBe(true);
    expect(g.caster.fizzledAt[MAT.water]).toBeGreaterThan(0);
  });

  it('a carrier whose whole payload fizzled is a dud, not a kinetic shot', () => {
    const g = setup(ROOM, '>~', {}, ['~']);
    click(g, 30, 6);
    expect(g.carriers.list[0]).toMatchObject({ kinetic: false, dud: MAT.water, payload: [] });
  });

  it('a bolt never hits the witch as it leaves the wand', () => {
    const g = setup(ROOM, '>');
    for (const [x, y] of [[30, 6], [3, 1], [0, 6], [4, 6.4]] as const) click(g, x, y, 25);
    expect(g.player.hp).toBe(g.player.maxHp);
  });

  it('self-damage: a kinetic lob thrown straight up comes down on her', () => {
    const tall = Game.fromAscii(['#####', ...Array<string>(17).fill('#   #'), '# @ #', '#####'].join('\n'), 1);
    tall.known.add(')');
    expect(tall.wand.write(')', tall.owns).ok).toBe(true);
    run(tall, 20);
    const tp = tall.player;
    click(tall, tp.x, tp.y - 10, 90);
    expect(tp.hp).toBeLessThan(tp.maxHp);
    expect(tp.hp).toBeCloseTo(tp.maxHp - TUNING.kineticDamage * TUNING.selfDamageScale, 5);
  });
});

describe('payload release', () => {
  it('releases 12 cells per matter glyph into open space', () => {
    const w = new World(`
      ##########
      #        #
      #        #
      #        #
      #        #
      #        #
      #        #
      ##########`);
    const n = releaseBurst(w.grid, w.sim, 5, 4, [MAT.sand, MAT.sand, MAT.water], TUNING.burstCellsPerGlyph, new Rng(1));
    expect(n).toBe(36);
    expect(w.count('.')).toBe(24);
    expect(w.count('~')).toBe(12);
  });

  it('never leaks through a wall, and only fills empty or gas cells', () => {
    const w = new World(`
      ###########
      #    #""""#
      #    #""""#
      #    #""""#
      ###########`);
    releaseBurst(w.grid, w.sim, 2.5, 2.5, [MAT.sand, MAT.sand, MAT.sand], TUNING.burstCellsPerGlyph, new Rng(1));
    for (const c of w.find('.')) expect(c.x).toBeLessThan(5);
    expect(w.count('.')).toBe(12); // only 12 cells of room on that side
    expect(w.count('#')).toBe(11 * 2 + 3 * 3);
  });

  it('matter released together reacts at once: water + fire boils on the spot', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = new World(['############', ...Array<string>(10).fill('#          #'), '############'].join('\n'), seed);
      releaseBurst(w.grid, w.sim, 6, 5, [MAT.water, MAT.fire], TUNING.burstCellsPerGlyph, new Rng(seed));
      expect(w.count('"'), `seed ${seed}`).toBeGreaterThanOrEqual(4); // before a single sim tick
      expect(w.reactions('fire+water')).toBe(w.count('"'));
    }
  });

  it('displaces gas', () => {
    const w = new World(`
      #####
      #"""#
      #"""#
      #####`);
    expect(releaseBurst(w.grid, w.sim, 2.5, 1.5, [MAT.water], 12, new Rng(1))).toBe(6);
    expect(w.count('~')).toBe(6);
    expect(w.count('"')).toBe(0);
  });
});

describe('scenarios: the M4 example spells in the world', () => {
  it('>~^ at a wall bursts into steam', () => {
    const g = setup(
      `
      ##############################
      #                            #
      #                            #
      #                            #
      #                            #
      #                            #
      #                            #
      #  @                         #
      ##############################`,
      '>~^',
      { '~': 5, '^': 5 },
    );
    expect(g.grid.count(MAT.steam)).toBe(0);
    click(g, 28.5, g.player.y, 90);
    expect(g.grid.count(MAT.steam)).toBeGreaterThanOrEqual(6);
    expect(g.pouch.count(MAT.water)).toBe(4);
    expect(g.pouch.count(MAT.fire)).toBe(4);
  });

  it(')=3 leaves an oil puddle on the floor', () => {
    const g = setup(
      `
      ########################################
      #                                      #
      #                                      #
      #                                      #
      #                                      #
      #                                      #
      #                                      #
      #  @                                   #
      ########################################`,
      ')=3',
      { '=': 10 },
    );
    click(g, 20, 3, 600);
    expect(g.carriers.list).toHaveLength(0);
    expect(g.grid.count(MAT.oil)).toBe(3 * TUNING.burstCellsPerGlyph);
    // A puddle: every oil cell lies in the bottom row or the one above it, spread out wide.
    let minX = 99;
    let maxX = 0;
    for (let y = 0; y < g.grid.height; y++) {
      for (let x = 0; x < g.grid.width; x++) {
        if (g.grid.get(x, y) !== MAT.oil) continue;
        expect(y).toBeGreaterThanOrEqual(6);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    expect(maxX - minX).toBeGreaterThanOrEqual(17);
  });

  it('>.3 fills a pit so the witch can cross it', () => {
    const g = setup(
      `
      ##############################
      #                            #
      #                            #
      #                            #
      #                            #
      #  @                         #
      #########      ###############
      #########      ###############
      #########      ###############
      ##############################`,
      '>.3',
      { '.': 10 },
    );
    const pit = (): number => {
      let n = 0;
      for (let y = 6; y <= 8; y++) for (let x = 9; x <= 14; x++) if (g.grid.get(x, y) === MAT.sand) n++;
      return n;
    };
    expect(pit()).toBe(0);
    // Skim the near lip: the bolt bursts on the pit's far wall and the sand drops in.
    click(g, 20, g.player.y + 1.6, 240);
    expect(pit()).toBeGreaterThanOrEqual(15);
    // Walk across: she should make it past the pit without falling in.
    run(g, 150, tickInput({ moveX: 1 }));
    expect(g.player.x).toBeGreaterThan(16);
    expect(g.player.y).toBeLessThan(6);
  });

  it('a water bolt puts out a fire', () => {
    const level = [
      '##############################',
      '#                            #',
      '#  @                         #',
      '#####                        #',
      '#####                        #',
      '#####             ^^^^^^     #',
      '#####            |||||||     #',
      '##############################',
    ].join('\n');
    const control = setup(level, '>');
    const g = setup(level, '>~3', { '~': 10 });
    // Shoot down from the ledge into the burning pile.
    click(g, 20, 6.5, 200);
    run(control, 201);
    expect(control.grid.count(MAT.fire)).toBeGreaterThan(3); // left alone, it is still burning
    expect(g.grid.count(MAT.fire)).toBe(0);
    expect(g.sim.reactionCounts[REACTIONS.findIndex((r) => r.id === 'fire+water')]).toBeGreaterThan(0);
  });
});
