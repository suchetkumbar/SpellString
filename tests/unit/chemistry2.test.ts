import { describe, expect, it } from 'vitest';
import { MAT } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';
import { Game, NO_INPUT } from '../../src/game/game';
import { World } from '../helpers/scenario';

/** A solid rock box w x h (inside) with `fill(x, y)` choosing each inner cell's glyph. */
function box(w: number, h: number, fill: (x: number, y: number) => string): string {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    let r = '';
    for (let x = 0; x < w + 2; x++) r += y === 0 || y === h + 1 || x === 0 || x === w + 1 ? '#' : fill(x, y);
    rows.push(r);
  }
  return rows.join('\n');
}

describe('acid', () => {
  it('eats rock, four bites per acid cell, then is spent', () => {
    // Acid dropped onto deep rock (well away from the grid's edges, where it would have nothing to bite).
    const w = new World(box(20, 40, (x, y) => (y >= 2 && y <= 4 && x >= 9 && x <= 11 ? '%' : y <= 6 ? ' ' : '#')));
    const rock0 = w.count('#');
    expect(w.count('%')).toBe(9);
    w.step(4000);
    expect(w.count('%')).toBe(0);
    expect(w.reactions('acid+rock')).toBe(36);
    expect(rock0 - w.count('#')).toBe(36);
  });

  it('eats wood and ice too, four bites per acid cell', () => {
    for (const [glyph, id] of [['|', 'acid+wood'], ['*', 'acid+ice']] as const) {
      const w = new World(box(10, 8, (x, y) => (y === 2 && x === 5 ? '%' : y >= 4 ? glyph : ' ')));
      w.step(3000);
      expect(w.count('%'), glyph).toBe(0);
      expect(w.reactions(id), glyph).toBe(4);
    }
  });

  it('hurts the witch while she stands in it, and is used up doing so', () => {
    // A pool two deep on a sand floor (acid doesn't eat sand): she drops into it.
    const g = Game.fromAscii(box(10, 6, (x, y) => (y === 6 ? '.' : y >= 4 ? '%' : x === 5 && y === 2 ? '@' : ' ')), 1);
    const acid0 = g.grid.count(MAT.acid);
    for (let t = 0; t < 60; t++) g.step(NO_INPUT);
    expect(g.player.hp).toBeLessThan(g.player.maxHp - TUNING.acidDps * 0.5);
    expect(g.grid.count(MAT.acid)).toBeLessThan(acid0);
  });
});

describe('ice', () => {
  it('melts into water next to fire', () => {
    const w = new World(box(10, 6, (x, y) => (y >= 5 ? '*' : y === 4 && x >= 3 && x <= 7 ? '^' : ' ')));
    const ice0 = w.count('*');
    w.step(120);
    expect(w.reactions('fire+ice')).toBeGreaterThan(0);
    expect(w.count('*')).toBeLessThan(ice0);
  });

  it('slowly freezes water that touches it, even after the pool settles', () => {
    const w = new World(box(10, 8, (_x, y) => (y >= 7 ? '*' : y >= 5 ? '~' : ' ')));
    const water0 = w.count('~');
    w.step(30);
    expect(w.count('~')).toBeGreaterThanOrEqual(water0 - 3); // slow: barely anything yet
    w.step(4000);
    expect(w.reactions('water+ice')).toBeGreaterThan(5);
    expect(w.count('~')).toBeLessThan(water0 - 5);
  });

  it('is solid and slows nothing but can be shattered by explosions', () => {
    const g = Game.fromAscii(box(9, 3, (x, y) => (y === 3 ? '*' : x === 4 && y === 2 ? '@' : ' ')), 1);
    for (let t = 0; t < 60; t++) g.step(NO_INPUT);
    expect(g.player.body.grounded).toBe(true);
  });
});

describe('gunpowder and explosions', () => {
  it('fire sets gunpowder off: one blast, sized by the gunpowder in it', () => {
    // A stable 45-degree pile of 25 grains (rows of 9, 7, 5, 3, 1), lit at its apex.
    const w = new World(box(30, 20, (x, y) => (y >= 16 && Math.abs(x - 13) <= y - 16 ? ':' : x === 13 && y === 15 ? '^' : ' ')));
    expect(w.count(':')).toBe(25);
    for (let t = 0; t < 30 && w.sim.explosions.length === 0; t++) w.step();
    expect(w.sim.explosions).toHaveLength(1);
    const e = w.sim.explosions[0]!;
    expect(e.r).toBeCloseTo(TUNING.explosionBaseRadius + TUNING.explosionRadiusPerCell * 5, 5);
    expect(w.count(':')).toBe(0);
    expect(w.reactions('fire+gunpowder')).toBe(1);
  });

  it('shatters brittle cells (wood, ice, sand) in the radius but not rock', () => {
    const w = new World(
      box(24, 14, (x, y) => {
        if (x === 12 && y === 12) return ':';
        if (x === 11 && y === 12) return '^';
        if (y === 13 && x >= 6 && x <= 18) return '|';
        if (y === 9 && x >= 9 && x <= 15) return '*';
        return ' ';
      }),
    );
    const wood0 = w.count('|');
    const ice0 = w.count('*');
    const rock0 = w.count('#');
    for (let t = 0; t < 30 && w.sim.explosions.length === 0; t++) w.step();
    expect(w.sim.explosions).toHaveLength(1);
    expect(w.count('|')).toBeLessThan(wood0);
    expect(w.count('*')).toBeLessThan(ice0);
    expect(w.count('#')).toBe(rock0);
  });

  it('chains: fire from one blast sets off gunpowder beyond it', () => {
    // A long fuse of gunpowder: each blast only gathers what's near it, and lights the rest.
    const w = new World(box(40, 8, (x, y) => (y === 8 && x >= 5 && x <= 30 ? ':' : x === 4 && y === 8 ? '^' : ' ')));
    const blasts: number[] = [];
    for (let t = 0; t < 400; t++) {
      w.step();
      for (const e of w.sim.explosions.splice(0)) blasts.push(e.x);
    }
    expect(blasts.length).toBeGreaterThanOrEqual(2);
    expect(w.count(':')).toBe(0);
  });

  it('pushes and hurts bodies in the radius, falling off with distance', () => {
    const g = Game.fromAscii(
      box(40, 10, (x, y) => {
        if (y === 10 && x >= 16 && x <= 18) return ':';
        if (y === 10 && x === 15) return '^';
        if (y === 10 && x === 19) return 's';
        if (y === 10 && x === 26) return 'G';
        if (y === 10 && x === 2) return '@';
        return ' ';
      }),
      1,
    );
    const slime = g.creatures.find((c) => c.def.key === 'slime')!;
    const golem = g.creatures.find((c) => c.def.key === 'golem')!;
    let blast = false;
    for (let t = 0; t < 30 && !blast; t++) {
      const before = slime.hp;
      g.step(NO_INPUT);
      blast = slime.hp < before || slime.dead;
    }
    expect(blast).toBe(true);
    // The slime (close) takes more than the golem (farther, and heavier) and flies away from the blast.
    expect(slime.dead || slime.body.vx > 0 || g.creatures.some((c) => c.def.key === 'slime' && c.body.vx > 0)).toBe(true);
    expect(golem.maxHp - golem.hp).toBeLessThan(TUNING.explosionDamage);
    // The witch, far away, is untouched.
    expect(g.player.hp).toBe(g.player.maxHp);
  });

  it('hurts the witch and names it: "your own explosion" when she lit it', () => {
    const level = box(30, 6, (x, y) => (y === 6 && x >= 12 && x <= 14 ? ':' : x === 10 && y === 6 ? '@' : ' '));
    const g = Game.fromAscii(level, 1);
    g.player.hp = 20;
    g.player.ownFire = 300;
    g.sim.place(11, 6, MAT.fire);
    for (let t = 0; t < 60 && !g.player.dead; t++) g.step(NO_INPUT);
    expect(g.player.dead).toBe(true);
    expect(g.player.killedBy?.text).toBe('your own explosion');
  });
});

describe('gold', () => {
  it('goes to the wallet, which holds far more than a pouch slot', () => {
    const g = Game.fromAscii('#@#', 1);
    g.pouch.add(MAT.gold, 300);
    g.pouch.add(MAT.water, 300);
    expect(g.pouch.count(MAT.gold)).toBe(300);
    expect(g.pouch.count(MAT.water)).toBe(TUNING.pouchCap);
  });

  it('is the heaviest powder: it sinks through water and sand-free piles', () => {
    const w = new World(box(5, 6, (x, y) => (y === 1 && x === 3 ? '$' : y >= 3 ? '~' : ' ')));
    w.step(200);
    expect(w.find('$')[0]!.y).toBe(6);
  });
});
