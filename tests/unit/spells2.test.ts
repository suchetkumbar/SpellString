import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAT, MATERIAL_BY_GLYPH } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';
import { BIOMES } from '../../src/data/biomes';
import { generateLevel } from '../../src/core/levelgen';
import { Game, NO_INPUT, tickInput, type TickInput } from '../../src/game/game';
import { Run } from '../../src/game/run';
import { Wand } from '../../src/game/wand';
import { compileSpell } from '../../src/game/spell/compile';
import { CHAOS } from '../../src/game/spell/plan';

function run(g: Game, ticks: number, input: TickInput = NO_INPUT): Game {
  for (let t = 0; t < ticks; t++) g.step(input);
  return g;
}

/** A game where the witch knows every glyph and holds these charges, with `spell` in a wand of `slots`. */
function setup(level: string, spell: string, charges: Record<string, number>, slots = 9): Game {
  const g = Game.fromAscii(level, 1);
  for (const ch of ['>', ')', '+', '@', '_', '!', '?', '[', ']']) g.known.add(ch);
  for (const [glyph, n] of Object.entries(charges)) g.pouch.add(MATERIAL_BY_GLYPH.get(glyph)!, n);
  g.wands[0] = new Wand({ slots, maxMana: 1000, manaRegen: 0, castDelayTicks: 5, rechargeTicks: 18 });
  const c = g.wand.write(spell, g.owns);
  expect(c.parse.errors, spell).toEqual([]);
  run(g, 10);
  return g;
}

function click(g: Game, x: number, y: number, after = 0): Game {
  g.step(tickInput({ cast: true, aimX: x, aimY: y }));
  return run(g, after, tickInput({ aimX: x, aimY: y }));
}

function room(w: number, h: number, place: Record<string, [number, number]> = {}): string {
  const rows: string[][] = [];
  for (let y = 0; y < h + 2; y++) rows.push(Array.from({ length: w + 2 }, (_, x) => (y === 0 || y === h + 1 || x === 0 || x === w + 1 ? '#' : ' ')));
  for (const [ch, [x, y]] of Object.entries(place)) rows[y]![x] = ch;
  return rows.map((r) => r.join('')).join('\n');
}

describe('interpreter: M7 spells', () => {
  it('chaos stays a placeholder until cast time; loops and triggers expand under the caps', () => {
    expect(compileSpell('>?').plan.casts[0]!.payload).toEqual([CHAOS]);
    const p = compileSpell('[>!)~]3').plan;
    expect(p.casts).toHaveLength(3);
    expect(p.casts.every((c) => c.trigger.length === 1 && c.trigger[0]!.delivery === ')')).toBe(true);
    expect(p.carriers).toBe(6);
    expect(compileSpell('@*3').plan.casts[0]).toMatchObject({ delivery: '@', payload: [MAT.ice, MAT.ice, MAT.ice] });
    expect(compileSpell('_:^').plan.casts[0]).toMatchObject({ delivery: '_', payload: [MAT.gunpowder, MAT.fire] });
  });
});

describe('the M7 example spells, in play', () => {
  it('>!)~5: a bolt that lobs a big blob of water from wherever it hits', () => {
    const g = setup(room(40, 10, { '@': [3, 10] }), '>!)~5', { '~': 10 });
    click(g, 39, 9.5, 4);
    // The bolt is on its way; nothing lobbed yet.
    expect(g.carriers.list.map((c) => c.delivery)).toEqual(['>']);
    let lob: { x: number } | null = null;
    for (let t = 0; t < 120 && !lob; t++) {
      g.step(tickInput({ aimX: 39, aimY: 9.5 }));
      const l = g.carriers.list.find((c) => c.delivery === ')');
      if (l) lob = { x: l.x };
    }
    expect(lob).not.toBeNull();
    expect(lob!.x).toBeGreaterThan(35); // launched from the far wall, not from the witch
    run(g, 300);
    expect(g.grid.count(MAT.water)).toBe(5 * TUNING.burstCellsPerGlyph);
    expect(g.pouch.count(MAT.water)).toBe(5);
  });

  it('_:^ a gunpowder mine: sticks where it lands, and goes up when a creature comes by', () => {
    const g = setup(room(40, 8, { '@': [3, 8] }), '_:^', { ':': 5, '^': 5 });
    click(g, 20, 8.5, 90);
    const mine = g.carriers.list.find((c) => c.mine);
    expect(mine?.stuck).toBe(true);
    expect(g.grid.count(MAT.gunpowder)).toBe(0); // still waiting
    const mx = mine!.x;
    run(g, 120);
    expect(g.carriers.list).toContain(mine); // nothing comes by: it waits
    const slime = g.spawnCreature('slime', mx + 3, 8.5);
    let blew = false;
    for (let t = 0; t < 240 && !blew; t++) {
      g.step(NO_INPUT);
      blew = g.sim.reactionCounts.some((n, i) => n > 0 && i === 9) || !g.carriers.list.includes(mine!);
    }
    expect(blew).toBe(true);
    run(g, 60);
    expect(slime.hp < slime.maxHp || slime.dead || g.creatures.length !== 1).toBe(true);
  });

  it('[>.]4: four sand bolts in a row, an instant ramp', () => {
    const g = setup(room(40, 10, { '@': [3, 10] }), '[>.]4', { '.': 10 });
    click(g, 25, 10.5, 2);
    let launched = 1;
    for (let t = 0; t < 30; t++) {
      const before = g.carriers.list.length;
      g.step(tickInput({ aimX: 25, aimY: 10.5 }));
      if (g.carriers.list.length > before) launched++;
    }
    expect(launched).toBe(4);
    run(g, 200);
    expect(g.pouch.count(MAT.sand)).toBe(6);
    expect(g.grid.count(MAT.sand)).toBe(4 * TUNING.burstCellsPerGlyph);
  });

  it('@*3: an ice shell around the witch, leaving her own space clear', () => {
    const g = setup(room(20, 10, { '@': [10, 10] }), '@*3', { '*': 5 });
    const b = g.player.body;
    click(g, 15, 10, 1);
    expect(g.grid.count(MAT.ice)).toBe(3 * TUNING.burstCellsPerGlyph);
    for (let y = Math.floor(b.y - b.hh); y <= Math.floor(b.y + b.hh); y++) {
      for (let x = Math.floor(b.x - b.hw); x <= Math.floor(b.x + b.hw); x++) expect(g.grid.get(x, y), `${x},${y}`).not.toBe(MAT.ice);
    }
    // Ice on every side of her.
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) expect(g.grid.get(Math.floor(b.x) + dx!, Math.floor(b.y) + dy!)).toBe(MAT.ice);
  });

  it('@ with no payload: a shockwave that shoves creatures away', () => {
    const g = setup(room(20, 6, { '@': [10, 6] }), '@', {});
    const bat = g.spawnCreature('bat', g.player.x + 2, g.player.y - 1);
    click(g, 15, 6, 1);
    expect(bat.hp).toBeLessThan(bat.maxHp);
    expect(bat.body.vx).toBeGreaterThan(0);
  });

  it('? casts a random matter glyph you have charges for', () => {
    const g = setup(room(30, 6, { '@': [3, 6] }), '>?', { '~': 3 });
    click(g, 29, 5.5, 80);
    expect(g.grid.count(MAT.water)).toBe(TUNING.burstCellsPerGlyph);
    expect(g.pouch.count(MAT.water)).toBe(2);
  });

  it('+>!> triggers once per carrier', () => {
    const g = setup(room(40, 12, { '@': [3, 12] }), '+>!>', {});
    const seen = new Set<object>();
    g.step(tickInput({ cast: true, aimX: 39, aimY: 11 }));
    for (let t = 0; t < 120; t++) {
      for (const c of g.carriers.list) seen.add(c);
      g.step(tickInput({ aimX: 39, aimY: 11 }));
    }
    expect(seen.size).toBe(6);
  });

  it('a spell over a cap is cut off with a warning and never hangs, at runtime too', () => {
    const g = setup(room(60, 30, { '@': [3, 30] }), '[[+>]9]9', {}, 9);
    const t0 = performance.now();
    const seen = new Set<object>();
    g.step(tickInput({ cast: true, aimX: 59, aimY: 20 }));
    for (let t = 0; t < 400; t++) {
      for (const c of g.carriers.list) seen.add(c);
      g.step(tickInput({ aimX: 59, aimY: 20 }));
    }
    expect(seen.size).toBeLessThanOrEqual(TUNING.maxCarriersPerClick);
    expect(seen.size).toBeGreaterThan(20);
    expect(g.messages.some((m) => m.text.startsWith('Spell cut off'))).toBe(true);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('three wands', () => {
  it('keys 1-3 switch wands; each keeps its own spell and mana', () => {
    const g = setup(room(30, 6, { '@': [3, 6] }), '>', {});
    g.wands.push(new Wand(), new Wand());
    g.wands[1]!.write('>>', g.owns);
    g.step(tickInput({ wandSlot: 1 }));
    expect(g.activeWand).toBe(1);
    expect(g.wand.spell.text).toBe('>>');
    const m0 = g.wands[0]!.mana;
    click(g, 29, 5);
    expect(g.wands[1]!.mana).toBeLessThan(g.wands[1]!.stats.maxMana);
    expect(g.wands[0]!.mana).toBe(m0);
    g.step(tickInput({ wandSlot: 5 })); // no such wand: ignored
    expect(g.activeWand).toBe(1);
  });

  it('shrines can offer a new wand, up to three', () => {
    const testRoom = readFileSync(new URL('../../levels/test-room.txt', import.meta.url), 'utf8');
    let wandsSeen = 0;
    let r = new Run(1, 'run', { testRoom });
    for (let seed = 1; seed <= 12 && wandsSeen === 0; seed++) {
      r = new Run(seed, 'run', { testRoom });
      wandsSeen = 0;
      for (let level = 1; level < r.totalLevels; level++) {
        const e = r.game.features.portal!;
        r.game.player.body.x = e.x + 0.5;
        r.game.player.body.y = e.y + 0.5;
        r.step(NO_INPUT);
        const i = r.offers.findIndex((o) => o.kind === 'newWand');
        if (i >= 0) wandsSeen++;
        r.choose(Math.max(0, i));
        if (r.phase === 'shrine') r.descend();
      }
    }
    expect(wandsSeen).toBeGreaterThan(0);
    expect(r.game.wands.length).toBeGreaterThan(1);
    expect(r.game.wands.length).toBeLessThanOrEqual(3);
  });
});

describe('gold', () => {
  it('a $ shot spends gold, drops only a few nuggets, and hits hard', () => {
    const g = setup(room(30, 6, { '@': [3, 6], G: [20, 6] }), '>$', { $: 10 });
    const golem = g.creatures[0]!;
    click(g, golem.x, golem.y, 60);
    expect(g.pouch.count(MAT.gold)).toBe(9);
    expect(g.grid.count(MAT.gold)).toBe(3);
    expect(golem.maxHp - golem.hp).toBeGreaterThanOrEqual(TUNING.carrierImpactDamage + 15 * golem.def.heavyScale - 1e-9);
  });

  it('buys extra shrine gifts: the first is free, more cost gold', () => {
    const testRoom = readFileSync(new URL('../../levels/test-room.txt', import.meta.url), 'utf8');
    const r = new Run(4, 'run', { testRoom });
    r.game.pouch.add(MAT.gold, 60);
    const e = r.game.features.portal!;
    r.game.player.body.x = e.x + 0.5;
    r.game.player.body.y = e.y + 0.5;
    r.step(NO_INPUT);
    expect(r.phase).toBe('shrine');
    expect(r.giftCost).toBe(0);
    r.choose(0);
    expect(r.phase).toBe('shrine'); // can afford another
    expect(r.giftCost).toBe(TUNING.shrineExtraCost);
    r.choose(0);
    expect(r.gold).toBe(60 - TUNING.shrineExtraCost);
    expect(r.phase).toBe('shrine');
    r.choose(0); // 35 gold: a third gift
    expect(r.phase).toBe('level'); // all offers taken: down we go
    expect(r.game.pouch.count(MAT.gold)).toBe(60 - 2 * TUNING.shrineExtraCost);
  });
});

describe('the Frozen Vaults', () => {
  it('generate with an ice crust, gunpowder caches, gold, and golems and imps', () => {
    const vaults = BIOMES.find((b) => b.key === 'vaults')!;
    let ice = 0;
    let gunpowder = 0;
    let gold = 0;
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const l = generateLevel(seed, vaults, 5);
      ice += l.grid.count(MAT.ice);
      gunpowder += l.grid.count(MAT.gunpowder);
      gold += l.grid.count(MAT.gold);
      for (const c of l.creatures) kinds.add(c.key);
    }
    expect(ice).toBeGreaterThan(2000);
    expect(gunpowder).toBeGreaterThan(300);
    expect(gold).toBeGreaterThan(50);
    expect([...kinds].sort()).toEqual(['bat', 'golem', 'imp']);
  });
});
