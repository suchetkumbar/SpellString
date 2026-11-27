import { describe, expect, it } from 'vitest';
import { Game, NO_INPUT, tickInput, type TickInput } from '../../src/game/game';
import { CREATURES, CREATURE_BY_GLYPH } from '../../src/data/creatures';
import { MAT, MATERIAL_BY_GLYPH, MATERIALS, type MaterialKey } from '../../src/data/materials';
import { SPELL_GLYPH_BY_CHAR } from '../../src/data/spellGlyphs';
import { TUNING } from '../../src/data/tuning';
import { canSee, damageCreature, lobAngle } from '../../src/game/creatures';
import type { Creature } from '../../src/game/creature';
import { loadAsciiLevel } from '../../src/core/level';

function run(g: Game, ticks: number, input: TickInput = NO_INPUT, world = true): Game {
  for (let t = 0; t < ticks; t++) g.step(input, world);
  return g;
}

function only(g: Game, glyph: string): Creature {
  const list = g.creatures.filter((c) => c.def.glyph === glyph);
  expect(list).toHaveLength(1);
  return list[0]!;
}

/** A closed room: `w` wide inside, `h` tall inside, with extra rows/cells placed by the caller. */
function room(w: number, h: number, place: Record<string, [number, number]>): string {
  const rows: string[][] = [];
  for (let y = 0; y < h + 2; y++) {
    rows.push(Array.from({ length: w + 2 }, (_, x) => (y === 0 || y === h + 1 || x === 0 || x === w + 1 ? '#' : ' ')));
  }
  for (const [ch, [x, y]] of Object.entries(place)) rows[y]![x] = ch;
  return rows.map((r) => r.join('')).join('\n');
}

describe('creature data', () => {
  it('has the five creatures with unique glyphs that clash with nothing', () => {
    expect(CREATURES.map((c) => c.glyph).sort()).toEqual(['G', 'b', 'i', 's', 't']);
    for (const c of CREATURES) {
      expect(MATERIAL_BY_GLYPH.has(c.glyph), c.glyph).toBe(false);
      expect(SPELL_GLYPH_BY_CHAR.has(c.glyph), c.glyph).toBe(false);
      expect(c.hp).toBeGreaterThan(0);
      expect(c.attack.windup).toBeGreaterThanOrEqual(18); // every attack is telegraphed
      for (const key of Object.keys(c.materials)) expect(MAT[key as MaterialKey], key).toBeDefined();
      if (c.drop) expect(MAT[c.drop.material]).toBeDefined();
    }
  });

  it('level maps place creatures from their letters', () => {
    const level = loadAsciiLevel(`
      #######
      #b s i#
      #t G @#
      #######`);
    expect(level.creatures.map((c) => c.key).sort()).toEqual(['bat', 'golem', 'imp', 'slime', 'toad']);
    expect(level.creatures.find((c) => c.key === 'golem')).toMatchObject({ x: 3, y: 2 });
    expect(level.grid.get(1, 1)).toBe(MAT.empty);
    expect(CREATURE_BY_GLYPH.get('G')?.name).toBe('stone golem');
  });
});

describe('the M5 done-when list', () => {
  it('water hurts an imp (badly), fire does not', () => {
    const level = room(14, 8, { i: [7, 4], '@': [1, 8] });
    const wet = Game.fromAscii(level, 1);
    const dry = Game.fromAscii(level, 1);
    const impWet = only(wet, 'i');
    const impDry = only(dry, 'i');
    for (let t = 0; t < 90; t++) {
      // Pour water on one imp and fire on the other, right where they hover.
      for (const dx of [-1, 0, 1]) {
        wet.sim.place(Math.floor(impWet.x) + dx, Math.floor(impWet.y) - 1, MAT.water);
        if (!impDry.dead) dry.sim.place(Math.floor(impDry.x) + dx, Math.floor(impDry.y) - 1, MAT.fire);
      }
      wet.step(NO_INPUT);
      dry.step(NO_INPUT);
      if (impWet.dead) break;
    }
    expect(impWet.dead).toBe(true);
    expect(impDry.hp).toBe(impDry.maxHp);
  });

  it('a toad ignites when fire touches it, and keeps hopping while it burns', () => {
    const g = Game.fromAscii(room(30, 6, { t: [15, 6], '@': [1, 6] }), 1);
    const toad = only(g, 't');
    run(g, 10);
    expect(toad.burning).toBe(0);
    g.sim.place(Math.floor(toad.x) + 1, Math.floor(toad.y), MAT.fire);
    run(g, 2);
    expect(toad.burning).toBeGreaterThan(0);
    const xs = new Set<number>();
    let hops = 0;
    let wasGrounded = true;
    for (let t = 0; t < 150 && !toad.dead; t++) {
      g.step(NO_INPUT);
      xs.add(Math.round(toad.x));
      if (wasGrounded && !toad.body.grounded) hops++;
      wasGrounded = toad.body.grounded;
    }
    expect(hops).toBeGreaterThanOrEqual(3);
    expect(xs.size).toBeGreaterThan(3);
    expect(toad.hp).toBeLessThan(toad.maxHp);
  });

  it('smoke blocks line of sight (and so does rock, but not water)', () => {
    const open = Game.fromAscii(room(20, 5, { b: [16, 3], '@': [3, 5] }), 1);
    const bat = only(open, 'b');
    expect(canSee(open.grid, bat, open.player)).toBe(true);
    for (const [mat, blocks] of [[MAT.smoke, true], [MAT.rock, true], [MAT.sand, true], [MAT.water, false], [MAT.steam, false]] as const) {
      const g = Game.fromAscii(room(20, 5, { b: [16, 3], '@': [3, 5] }), 1);
      for (let y = 1; y <= 5; y++) for (let x = 9; x <= 11; x++) g.grid.set(x, y, mat);
      expect(canSee(g.grid, only(g, 'b'), g.player), MATERIALS[mat]!.name).toBe(!blocks);
    }

    // And in play: behind a smoke screen the bat never notices her (materials frozen so the screen holds).
    const screened = Game.fromAscii(room(20, 5, { b: [16, 3], '@': [3, 5] }), 1);
    for (let y = 1; y <= 5; y++) for (let x = 9; x <= 11; x++) screened.grid.set(x, y, MAT.smoke);
    run(screened, 40, NO_INPUT, false);
    run(open, 40, NO_INPUT, false);
    expect(only(screened, 'b').alert).toBe(0);
    expect(only(screened, 'b').state).toBe('idle');
    expect(bat.alert).toBeGreaterThan(0);
  });

  it("a slime's death leaves water you can harvest", () => {
    const g = Game.fromAscii(room(20, 6, { s: [12, 6], '@': [4, 6] }), 1);
    run(g, 10);
    const slime = only(g, 's');
    expect(g.grid.count(MAT.water)).toBe(0);
    damageCreature(g, slime, 1000, 'impact', 0, 0, 0, 'player');
    expect(slime.dead).toBe(true);
    expect(g.grid.count(MAT.water)).toBe(slime.def.drop!.cells);
    run(g, 60);
    expect(g.creatures).toHaveLength(0);
    // Harvest it, sweeping along the puddle.
    for (let x = 5; x <= 20; x++) run(g, 12, tickInput({ harvest: true, aimX: x + 0.5, aimY: 6.5 }));
    run(g, 60);
    expect(g.pouch.count(MAT.water)).toBeGreaterThanOrEqual(10);
  });
});

describe('creature behavior', () => {
  it('a hit slime splits in two, twice over; the smallest just dies', () => {
    const g = Game.fromAscii(room(30, 6, { s: [15, 6], '@': [2, 6] }), 1);
    run(g, 5);
    damageCreature(g, only(g, 's'), 6, 'impact', 1, 0, 5, 'player');
    run(g, 1);
    expect(g.creatures).toHaveLength(2);
    expect(g.creatures.every((c) => c.generation === 1 && c.hp === (24 - 6) / 2)).toBe(true);
    run(g, TUNING.creatureHitIFrames); // fresh halves have a moment of i-frames
    damageCreature(g, g.creatures[0]!, 1, 'impact', 1, 0, 5, 'player');
    run(g, 1);
    expect(g.creatures.filter((c) => c.generation === 2)).toHaveLength(2);
    run(g, TUNING.creatureHitIFrames);
    const small = g.creatures.find((c) => c.generation === 2)!;
    const hp = small.hp;
    damageCreature(g, small, 1, 'impact', 1, 0, 5, 'player');
    run(g, 1);
    // The smallest size doesn't split again: it just gets hurt.
    expect(g.creatures).toHaveLength(3);
    expect(small.dead).toBe(false);
    expect(small.hp).toBe(hp - 1);
  });

  it('attacks are telegraphed: a bat winds up before it can hurt her', () => {
    const g = Game.fromAscii(room(24, 8, { b: [14, 3], '@': [6, 8] }), 2);
    const bat = only(g, 'b');
    const states: string[] = [];
    let hurtAt = -1;
    for (let t = 0; t < 400 && hurtAt < 0; t++) {
      g.step(NO_INPUT);
      states.push(bat.state);
      if (g.player.hp < g.player.maxHp) hurtAt = t;
    }
    expect(hurtAt).toBeGreaterThan(0);
    // The ticks right before the hit: an attack, preceded by a full windup.
    const firstAttack = states.indexOf('attack');
    expect(firstAttack).toBeGreaterThan(0);
    const windup = states.slice(0, firstAttack).reverse().findIndex((s) => s !== 'windup');
    expect(windup === -1 ? firstAttack : windup).toBeGreaterThanOrEqual(bat.def.attack.windup);
    expect(g.player.killedBy).toBeNull();
  });

  it('the witch has i-frames: two blows in quick succession only hurt once', () => {
    const g = Game.fromAscii(room(10, 4, { '@': [3, 4] }), 1);
    const src = { glyph: 'b', text: 'a bat' };
    expect(g.player.hit(10, src, 1, 0, 5)).toBe(true);
    expect(g.player.hit(10, src, 1, 0, 5)).toBe(false);
    run(g, TUNING.playerHitIFrames);
    expect(g.player.hit(10, src, 1, 0, 5)).toBe(true);
    expect(g.player.hp).toBe(80);
  });

  it('a kinetic bolt hurts and knocks back, with i-frames and a damage number', () => {
    const g = Game.fromAscii(room(30, 6, { G: [20, 6], '@': [3, 6] }), 1);
    const golem = only(g, 'G');
    run(g, 10);
    const x0 = golem.x;
    const hit = damageCreature(g, golem, 10, 'impact', 1, 0, 20, 'player');
    expect(hit).toBe(true);
    expect(damageCreature(g, golem, 10, 'impact', 1, 0, 20, 'player')).toBe(false); // i-frames
    expect(golem.hp).toBe(golem.maxHp - 10);
    expect(g.effects.texts.map((t) => t.text)).toEqual(['10']);
    run(g, 3);
    expect(golem.x).toBeGreaterThan(x0);
  });

  it('golems shrug off kinetic shots and fire but take heavy sand hits hard', () => {
    const shoot = (spell: string, charges: Record<number, number>) => {
      const g = Game.fromAscii(room(30, 5, { G: [20, 5], '@': [6, 5] }), 1);
      for (const [m, n] of Object.entries(charges)) g.pouch.add(Number(m), n);
      expect(g.wand.write(spell, g.owns).ok).toBe(true);
      run(g, 5);
      const golem = only(g, 'G');
      g.step(tickInput({ cast: true, aimX: golem.x, aimY: golem.y }));
      run(g, 30, tickInput({ aimX: golem.x, aimY: golem.y }));
      return golem.maxHp - golem.hp;
    };
    const kinetic = shoot('>', {});
    const sand = shoot('>.3', { [MAT.sand]: 5 });
    expect(kinetic).toBeCloseTo(TUNING.kineticDamage * 0.35, 5);
    expect(sand).toBeGreaterThan(kinetic * 5);

    const g = Game.fromAscii(room(12, 5, { G: [6, 5], '@': [1, 5] }), 1);
    const golem = only(g, 'G');
    for (let t = 0; t < 60; t++) {
      g.sim.place(Math.floor(golem.x) + 1, Math.floor(golem.y), MAT.fire);
      g.step(NO_INPUT);
    }
    expect(golem.hp).toBe(golem.maxHp);
    expect(golem.burning).toBe(0);
  });

  it('burning spreads between creatures: an imp sets a toad alight', () => {
    const g = Game.fromAscii(room(20, 6, { t: [10, 6], '@': [2, 6] }), 1);
    run(g, 5);
    const toad = only(g, 't');
    expect(toad.burning).toBe(0);
    g.spawnCreature('imp', toad.x, toad.y);
    run(g, 1);
    expect(toad.burning).toBeGreaterThan(0);
  });

  it("an imp's fire bolt that hits a toad hurts it and sets it burning", () => {
    const g = Game.fromAscii(room(30, 6, { t: [20, 6], i: [5, 6], '@': [2, 1] }), 1);
    run(g, 5);
    const toad = only(g, 't');
    const imp = only(g, 'i');
    g.carriers.launch(g, {
      delivery: '>', x: imp.x, y: toad.y, angle: 0, speed: 20, payload: [MAT.fire], perGlyph: 4,
      kinetic: false, owner: imp, hitDamage: 6, source: imp.source,
    });
    run(g, 60);
    expect(toad.hp).toBeLessThan(toad.maxHp);
    expect(toad.burning > 0 || toad.dead).toBe(true);
  });

  it('a burning witch sets a toad alight, and a fiery imp sets her alight', () => {
    const g = Game.fromAscii(room(12, 4, { '@': [5, 4] }), 1);
    run(g, 5);
    const toad = g.spawnCreature('toad', g.player.x, g.player.y);
    g.player.burning = 100;
    run(g, 1);
    expect(toad.burning).toBeGreaterThan(0);
    const g2 = Game.fromAscii(room(12, 4, { '@': [5, 4] }), 1);
    run(g2, 5);
    g2.spawnCreature('imp', g2.player.x, g2.player.y);
    run(g2, 1);
    expect(g2.player.burning).toBeGreaterThan(0);
  });

  it('each creature drops its material on death; bats drop nothing', () => {
    for (const [glyph, mat] of [['t', MAT.oil], ['i', MAT.fire], ['G', MAT.rock], ['b', -1]] as const) {
      const g = Game.fromAscii(room(16, 6, { [glyph]: [8, 3], '@': [1, 6] }), 1);
      const before = mat > 0 ? g.grid.count(mat) : 0;
      const total = () => MATERIALS.reduce((n, m) => (m.id === 0 ? n : n + g.grid.count(m.id)), 0);
      const cells0 = total();
      damageCreature(g, only(g, glyph), 1e6, 'impact', 0, 0, 0, 'player');
      if (mat > 0) expect(g.grid.count(mat) - before, glyph).toBe(CREATURE_BY_GLYPH.get(glyph)!.drop!.cells);
      else expect(total()).toBe(cells0);
    }
  });

  it('creatures can kill the witch, and the death screen names them', () => {
    const g = Game.fromAscii(room(24, 8, { b: [14, 3], '@': [6, 8] }), 3);
    g.player.hp = 1;
    run(g, 600);
    expect(g.player.dead).toBe(true);
    expect(g.player.killedBy).toEqual({ glyph: 'b', text: 'a bat' });
  });

  it('a toad spits oil at the witch', () => {
    const g = Game.fromAscii(room(30, 6, { t: [20, 6], '@': [10, 6] }), 1);
    run(g, 300);
    expect(g.grid.count(MAT.oil)).toBeGreaterThan(0);
  });

  it('lob aiming lands near the target', () => {
    for (const [dx, dy] of [[8, 0], [-10, 2], [6, -3], [12, 4]] as const) {
      const v = 22; // the toad's spit
      const a = lobAngle(dx, dy, v, TUNING.lobGravity);
      let x = 0;
      let y = 0;
      const vx = Math.cos(a) * v;
      let vy = Math.sin(a) * v;
      let best = Infinity;
      for (let t = 0; t < 300; t++) {
        vy += TUNING.lobGravity / 60;
        x += vx / 60;
        y += vy / 60;
        best = Math.min(best, Math.hypot(x - dx, y - dy));
      }
      expect(best, `${dx},${dy}`).toBeLessThan(0.75);
    }
  });

  it('is deterministic for a seed', () => {
    const level = room(40, 10, { b: [30, 3], s: [25, 10], i: [20, 4], t: [15, 10], G: [33, 10], '@': [4, 10] });
    const a = run(Game.fromAscii(level, 7), 400);
    const b = run(Game.fromAscii(level, 7), 400);
    const snap = (g: Game) => g.creatures.map((c) => `${c.def.key}${c.x.toFixed(4)},${c.y.toFixed(4)},${c.hp.toFixed(3)}`).join('|');
    expect(snap(a)).toBe(snap(b));
    expect(a.player.hp).toBe(b.player.hp);
  });
});
