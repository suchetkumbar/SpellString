import { describe, expect, it } from 'vitest';
import { Game, NO_INPUT, tickInput, type TickInput } from '../../src/game/game';
import { moveBody, type Body } from '../../src/game/body';
import { loadAsciiLevel } from '../../src/core/level';
import { MAT } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';

function run(g: Game, ticks: number, input: TickInput | ((t: number) => TickInput) = NO_INPUT): Game {
  for (let t = 0; t < ticks; t++) g.step(typeof input === 'function' ? input(t) : input);
  return g;
}

function body(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, hw: TUNING.playerHalfWidth, hh: TUNING.playerHalfHeight, grounded: false, ignore: [] };
}

describe('collision: no tunneling', () => {
  const { grid } = loadAsciiLevel(`
    ####################
    #                  #
    #        #         #
    #        #         #
    #        #         #
    #                  #
    ####################`);

  it('a huge horizontal move stops flush against a 1-cell wall', () => {
    for (const dx of [5.3, 50, 5000, 1e9]) {
      const b = body(3.5, 3.5);
      const r = moveBody(grid, b, dx, 0, 0, false);
      expect(r.hitX).toBe(true);
      expect(b.x + b.hw).toBeLessThanOrEqual(9);
      expect(b.x + b.hw).toBeGreaterThan(8.99);
    }
  });

  it('works from the other side too', () => {
    const b = body(15.5, 3.5);
    moveBody(grid, b, -5000, 0, 0, false);
    expect(b.x - b.hw).toBeGreaterThanOrEqual(10);
  });

  it('a huge fall lands on a 1-cell floor', () => {
    const { grid: g2 } = loadAsciiLevel(`
      #####
      #   #
      #   #
      #   #
      #####
      #   #
      #####`);
    const b = body(2.5, 1.5);
    const r = moveBody(g2, b, 0, 10_000, 0, false);
    expect(r.landed).toBe(true);
    expect(b.y + b.hh).toBeLessThanOrEqual(4);
    expect(b.grounded).toBe(true);
  });

  it('a diagonal dash into a wall corner never ends inside rock', () => {
    const b = body(3.5, 3.5);
    moveBody(grid, b, 400, 400, 0, false);
    expect(b.x + b.hw).toBeLessThanOrEqual(9);
    expect(b.y + b.hh).toBeLessThanOrEqual(6);
  });

  it('the player at max speed never passes a 1-cell wall over many ticks', () => {
    const g = Game.fromAscii(`
      ####################
      #                  #
      #        #         #
      #  @     #         #
      ####################`, 1);
    for (let t = 0; t < 120; t++) {
      g.player.body.vx = TUNING.playerMaxSpeed * 10; // pushed far past the cap
      g.step(NO_INPUT);
      expect(g.player.x).toBeLessThan(9);
    }
  });
});

describe('walking and jumping', () => {
  const FLAT = `
    ##############################
    #                            #
    #                            #
    #                            #
    #                            #
    #                            #
    #                            #
    #  @                         #
    ##############################`;

  it('falls onto the floor and stands on it', () => {
    const g = run(Game.fromAscii(FLAT, 1), 60);
    expect(g.player.body.grounded).toBe(true);
    expect(g.player.y + g.player.body.hh).toBeCloseTo(8, 2);
  });

  it('walks at the tuned speed', () => {
    const g = run(Game.fromAscii(FLAT, 1), 30);
    run(g, 30, tickInput({ moveX: 1 }));
    expect(g.player.body.vx).toBeCloseTo(TUNING.walkSpeed, 5);
  });

  function peakHeight(holdTicks: number): number {
    const g = run(Game.fromAscii(FLAT, 1), 30);
    const ground = g.player.y;
    let peak = ground;
    for (let t = 0; t < 120; t++) {
      g.step(tickInput({ jumpPressed: t === 0, jumpHeld: t < holdTicks }));
      peak = Math.min(peak, g.player.y);
    }
    return ground - peak;
  }

  it('a held jump reaches the full height; a tap is much lower (variable height)', () => {
    const full = peakHeight(200);
    const expected = TUNING.jumpSpeed ** 2 / (2 * TUNING.gravity);
    expect(full).toBeGreaterThan(expected - 0.5);
    expect(full).toBeLessThan(expected + 0.5);
    expect(peakHeight(2)).toBeLessThan(full * 0.5);
  });

  const LEDGE = `
    ##############################
    #                            #
    #                            #
    #                            #
    #  @                         #
    #######                      #
    #                            #
    #                            #
    ##############################`;

  /** Walk off the ledge and press jump `late` ticks after leaving the ground. */
  function jumpAfterLeaving(late: number): boolean {
    const g = run(Game.fromAscii(LEDGE, 1), 30);
    let left = -1;
    for (let t = 0; t < 200; t++) {
      const airborne = !g.player.body.grounded;
      if (airborne && left < 0) left = t;
      const press = left >= 0 && t === left + late;
      g.step(tickInput({ moveX: 1, jumpPressed: press, jumpHeld: press }));
      if (press) return g.player.body.vy < 0;
    }
    return false;
  }

  it('coyote time: a jump just after walking off a ledge still works', () => {
    expect(jumpAfterLeaving(2)).toBe(true);
    expect(jumpAfterLeaving(TUNING.coyoteTicks - 1)).toBe(true); // the last coyote tick
  });

  it('coyote time runs out', () => {
    expect(jumpAfterLeaving(TUNING.coyoteTicks)).toBe(false);
  });

  it('jump buffer: pressing just before landing jumps on touchdown', () => {
    const g = Game.fromAscii(FLAT.replace('#  @', '#  @'), 1);
    g.player.body.y = 2; // in the air
    let pressedAt = -1;
    let jumped = false;
    for (let t = 0; t < 120; t++) {
      const b = g.player.body;
      // Press once when about 3 ticks from the floor.
      const press = pressedAt < 0 && b.vy > 0 && 8 - (b.y + b.hh) < (b.vy / 60) * 3;
      if (press) pressedAt = t;
      g.step(tickInput({ jumpPressed: press, jumpHeld: pressedAt >= 0 }));
      if (pressedAt >= 0 && g.player.body.vy < -TUNING.jumpSpeed * 0.8) {
        jumped = true;
        break;
      }
    }
    expect(pressedAt).toBeGreaterThan(0);
    expect(jumped).toBe(true);
  });

  it('steps up a 1-cell ledge but not a 2-cell wall', () => {
    const g = run(Game.fromAscii(`
      ##############################
      #                            #
      #                            #
      #                            #
      #                    #       #
      #  @      #          #       #
      ##############################`, 1), 20);
    run(g, 90, tickInput({ moveX: 1 }));
    expect(g.player.x).toBeGreaterThan(10); // climbed the 1-cell step
    expect(g.player.x).toBeLessThan(21); // stopped at the 2-cell wall
  });
});

describe('swimming', () => {
  const POOL = `
    ##############
    #            #
    #            #
    #  @         #
    #~~~~~~~~~~~~#
    #~~~~~~~~~~~~#
    #~~~~~~~~~~~~#
    #~~~~~~~~~~~~#
    #~~~~~~~~~~~~#
    #~~~~~~~~~~~~#
    ##############`;

  it('sinks slowly, swims down with S and up with W, and leaps out at the surface', () => {
    const g = run(Game.fromAscii(POOL, 1), 40);
    expect(g.player.swimming).toBe(true);
    expect(g.player.body.vy).toBeLessThanOrEqual(TUNING.swimSinkSpeed + 1e-9);

    run(g, 60, tickInput({ moveY: 1 }));
    const deep = g.player.y;
    expect(deep).toBeGreaterThan(8);

    run(g, 90, tickInput({ jumpHeld: true }));
    expect(g.player.y).toBeLessThan(deep - 3);

    // At the surface: a fresh jump press leaps clear of the water.
    let peak = g.player.y;
    for (let t = 0; t < 60; t++) {
      g.step(tickInput({ jumpPressed: t % 10 === 0, jumpHeld: true }));
      peak = Math.min(peak, g.player.y);
    }
    expect(peak).toBeLessThan(3.5);
  });
});

describe('statuses', () => {
  it('fire sets the witch burning; walking into water puts it out', () => {
    const g = Game.fromAscii(`
      ##################
      #                #
      #  @ ^     ~~~~~ #
      ##################`, 1);
    g.sim.step = () => undefined; // freeze the chemistry so the scene stays put
    run(g, 120, tickInput({ moveX: 1 }));
    expect(g.player.hp).toBeLessThan(g.player.maxHp);
    run(g, 5, tickInput({ moveX: 1 }));
    // By now she has crossed the fire and is wading in the water.
    expect(g.player.x).toBeGreaterThan(11);
    expect(g.player.burning).toBe(0);
  });

  it('burning keeps hurting after leaving the fire, until it runs out', () => {
    const g = Game.fromAscii(`
      ##########
      #  @     #
      ##########`, 1);
    g.player.burning = 60;
    run(g, 30);
    const mid = g.player.hp;
    expect(mid).toBeLessThan(g.player.maxHp);
    run(g, 200);
    expect(g.player.burning).toBe(0);
    expect(g.player.hp).toBeCloseTo(g.player.maxHp - (60 * TUNING.burnDps) / 60, 5);
  });

  it('a burning witch sets oil alight', () => {
    const g = Game.fromAscii(`
      ##########
      #  @     #
      #========#
      ##########`, 1);
    g.player.burning = 1000;
    run(g, 60);
    expect(g.sim.reactionCounts[1]).toBeGreaterThan(0); // fire+oil
  });

  it('steam scalds', () => {
    const g = Game.fromAscii(`
      ######
      #    #
      # @  #
      ######`, 1);
    g.sim.step = () => undefined;
    g.grid.set(2, 2, MAT.steam);
    g.step(NO_INPUT);
    expect(g.player.scalded).toBeGreaterThan(0);
    expect(g.player.hp).toBeLessThan(g.player.maxHp);
  });

  it('sand falling on the witch buries and then suffocates her', () => {
    const g = Game.fromAscii(`
      #######
      #.....#
      #.....#
      #.....#
      #..@..#
      #######`, 1);
    run(g, 30);
    expect(g.player.buried).toBe(true);
    const hp0 = g.player.hp;
    run(g, TUNING.suffocateGraceTicks + 60);
    expect(g.player.hp).toBeLessThan(hp0);
  });

  it('a buried witch can dig herself out by harvesting the sand', () => {
    const g = Game.fromAscii(`
      #######
      #.....#
      #.....#
      #.....#
      #..@..#
      #######`, 1);
    run(g, 30);
    expect(g.player.smothered).toBeGreaterThan(0);
    run(g, 90, tickInput({ harvest: true, aimX: g.player.x, aimY: g.player.y - 1 }));
    run(g, 30);
    expect(g.player.smothered).toBe(0);
    expect(g.player.buried).toBe(false);
    expect(g.pouch.count(MAT.sand)).toBeGreaterThan(10);
    expect(g.player.dead).toBe(false);
  });

  it('death records what killed her and stops her', () => {
    const g = Game.fromAscii(`
      ##########
      #  @     #
      ##########`, 1);
    g.player.burning = 100_000;
    run(g, 60 * 20);
    expect(g.player.dead).toBe(true);
    expect(g.player.killedBy?.glyph).toBe('^');
    const x = g.player.x;
    run(g, 30, tickInput({ moveX: 1 }));
    expect(g.player.x).toBe(x);
  });

  it('mana regenerates up to the max', () => {
    const g = Game.fromAscii('#@#', 1);
    g.player.mana = 0;
    run(g, 60);
    expect(g.player.mana).toBeCloseTo(TUNING.manaRegen, 5);
    run(g, 60 * 10);
    expect(g.player.mana).toBe(g.player.maxMana);
  });
});

describe('harvesting', () => {
  function pool(width: number, rows: number): string {
    const inner = width;
    const lines = ['#'.repeat(inner + 2), `#@${' '.repeat(inner - 1)}#`, `#${' '.repeat(inner)}#`];
    for (let r = 0; r < rows; r++) lines.push(`#${'~'.repeat(inner)}#`);
    lines.push('#'.repeat(inner + 2));
    return lines.join('\n');
  }

  it('moves N cells into N charges', () => {
    const g = Game.fromAscii(pool(10, 2), 1); // 20 water
    run(g, 20);
    run(g, 60 * 3, (t) => tickInput({ harvest: true, aimX: 1 + ((t >> 3) % 10), aimY: 4 }));
    run(g, 60 * 2); // let the last glyphs fly in
    expect(g.grid.count(MAT.water)).toBe(0);
    expect(g.pouch.count(MAT.water)).toBe(20);
    expect(g.pouch.inFlight[MAT.water]).toBe(0);
    expect(g.harvester.particles).toHaveLength(0);
  });

  it('respects the pouch cap, leaving the rest in the world', () => {
    const g = Game.fromAscii(pool(10, 8), 1); // 80 water
    run(g, 20);
    run(g, 60 * 6, (t) => tickInput({ harvest: true, aimX: 1 + ((t >> 3) % 10), aimY: 6 }));
    run(g, 60 * 2);
    expect(g.pouch.count(MAT.water)).toBe(TUNING.pouchCap);
    expect(g.grid.count(MAT.water)).toBe(80 - TUNING.pouchCap);
    expect(g.harvester.full).toBe(false); // button released
  });

  it('drains a pool from the top, like drinking', () => {
    const g = Game.fromAscii(pool(10, 4), 1);
    run(g, 20);
    run(g, 6, tickInput({ harvest: true, aimX: 5, aimY: 5.5 })); // 40 cells/s: 4 cells, all within radius on the top row
    // Only surface-row cells (y = 3) have been taken so far.
    expect(g.grid.count(MAT.water)).toBeLessThan(40);
    for (let x = 1; x <= 10; x++) for (let y = 4; y <= 6; y++) expect(g.grid.get(x, y)).toBe(MAT.water);
  });

  it('digs rock slowly, starting from the side nearest the witch', () => {
    const g = Game.fromAscii(`
      ############
      #          #
      # @  ####  #
      ############`, 1);
    run(g, 20);
    run(g, 60, tickInput({ harvest: true, aimX: 6.5, aimY: 2.5 }));
    run(g, 60);
    const dug = g.pouch.count(MAT.rock);
    expect(dug).toBeGreaterThanOrEqual(2);
    expect(dug).toBeLessThanOrEqual(3);
    expect(g.grid.get(5, 2)).toBe(MAT.empty); // the near face went first
  });

  it('cannot harvest through a wall', () => {
    const g = Game.fromAscii(`
      ############
      #          #
      # @   #~~~ #
      ############`, 1);
    run(g, 20);
    run(g, 120, tickInput({ harvest: true, aimX: 8.5, aimY: 2.5 }));
    expect(g.grid.count(MAT.water)).toBe(3);
  });

  it('nothing is harvested beyond reach', () => {
    const g = Game.fromAscii(`
      ##################################
      # @                          ~~~ #
      ##################################`, 1);
    run(g, 20);
    run(g, 120, tickInput({ harvest: true, aimX: 31.5, aimY: 1.5 }));
    expect(g.grid.count(MAT.water)).toBe(3);
  });

  it('is deterministic', () => {
    const go = (): string => {
      const g = Game.fromAscii(pool(10, 3), 9);
      run(g, 120, (t) => tickInput({ harvest: t > 20, aimX: 4 + (t % 5), aimY: 4, moveX: t % 40 < 20 ? 1 : -1 }));
      return `${g.player.x},${g.player.y},${g.pouch.count(MAT.water)},${g.harvester.particles.map((p) => p.x).join(',')}`;
    };
    expect(go()).toBe(go());
  });
});
