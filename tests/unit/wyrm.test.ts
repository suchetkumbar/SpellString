import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAsciiLevel } from '../../src/core/level';
import { MemoryStore } from '../../src/core/storage';
import { MAT, MATERIALS, type MaterialKey } from '../../src/data/materials';
import { WYRM } from '../../src/data/wyrm';
import { Codex } from '../../src/game/codex';
import { Game, NO_INPUT } from '../../src/game/game';
import { Run } from '../../src/game/run';
import type { Segment } from '../../src/game/wyrm';

const lair = readFileSync(new URL('../../levels/wyrm-lair.txt', import.meta.url), 'utf8');
const testRoom = readFileSync(new URL('../../levels/test-room.txt', import.meta.url), 'utf8');
const tutorial = readFileSync(new URL('../../levels/tutorial.txt', import.meta.url), 'utf8');
const LEVELS = { lair, testRoom, tutorial };

/** Surround a segment with a material (in the empty cells around it), as a spell burst would. */
function douse(g: Game, s: Segment, m: number): void {
  const cx = Math.floor(s.x);
  const cy = Math.floor(s.y);
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (g.grid.get(x, y) === MAT.empty) g.sim.place(x, y, m);
}

function lairGame(): Game {
  const g = Game.fromAscii(lair, 1);
  g.player.hp = 1e9; // the witch is a bystander in these tests
  return g;
}

describe('the lair', () => {
  it('keeps its acid: the basin is a gold bowl, so the acid never eats its own walls', () => {
    const count = (g: Game) => g.grid.mat.reduce((n, c) => n + (c === MAT.acid ? 1 : 0), 0);
    for (const seed of [1, 4]) {
      const g = Game.fromAscii(lair, seed);
      const before = count(g);
      for (let t = 0; t < 3600; t++) {
        g.player.hp = g.player.maxHp;
        g.step(NO_INPUT);
      }
      expect(count(g)).toBe(before);
    }
  }, 60_000);

  it('loads with the Wyrm, no exit, and every answer on hand', () => {
    const l = loadAsciiLevel(lair);
    expect(l.wyrm).not.toBeNull();
    expect(l.exit).toBeNull();
    expect(l.vents.length).toBe(1);
    expect(l.chests.length).toBeGreaterThanOrEqual(3);
    for (const m of [MAT.water, MAT.ice, MAT.acid, MAT.oil, MAT.gold, MAT.gunpowder]) expect(l.grid.count(m), MATERIALS[m]!.name).toBeGreaterThan(5);
    const g = lairGame();
    expect(g.wyrm!.segments.map((s) => MATERIALS[s.material]!.glyph).join('')).toBe(WYRM.body);
  });
});

describe('the Wyrm', () => {
  it('each segment dies to its weakness, and bursts into its material', () => {
    for (const [mat, weak] of Object.entries(WYRM.weakness) as [MaterialKey, MaterialKey][]) {
      const g = lairGame();
      const w = g.wyrm!;
      const target = w.segments.find((s) => s.material === MAT[mat])!;
      const before = g.grid.count(MAT[mat]);
      for (let t = 0; t < 400 && w.segments.includes(target); t++) {
        douse(g, target, MAT[weak]);
        g.step(NO_INPUT);
      }
      expect(w.segments.includes(target), `${mat} vs ${weak}`).toBe(false);
      expect(w.segments.length).toBe(WYRM.body.length - 1);
      // It bursts (a kill event), spilling its material. Rock and fire are being eaten or quenched
      // around it at the same time, so only check the count for the others.
      expect(g.events.some((e) => e.kind === 'kill'), mat).toBe(true);
      if (mat === 'oil' || mat === 'water') expect(g.grid.count(MAT[mat]), mat).toBeGreaterThan(before);
    }
  });

  it('shrugs off the wrong matter', () => {
    const g = lairGame();
    const w = g.wyrm!;
    const oil = w.segments.find((s) => s.material === MAT.oil)!;
    for (let t = 0; t < 120; t++) {
      douse(g, oil, MAT.sand);
      g.step(NO_INPUT);
    }
    expect(oil.hp).toBe(oil.maxHp);
  });

  it('kinetic bolts only chip it; explosions hurt every segment in reach', () => {
    const g = lairGame();
    const w = g.wyrm!;
    const s = w.segments[0]!;
    w.damage(g, s, 6, false);
    expect(s.hp).toBeCloseTo(s.maxHp - 6 * WYRM.chipScale, 5);
    const hp = w.segments.map((x) => x.hp);
    w.blast(g, w.segments[5]!.x, w.segments[5]!.y, 8);
    const hurt = w.segments.filter((x, i) => x.hp < hp[i]!).length;
    expect(hurt).toBeGreaterThan(3);
  });

  it('burrows through rock as it moves, and its body follows its head', () => {
    const g = lairGame();
    const rock0 = g.grid.count(MAT.rock);
    for (let t = 0; t < 600; t++) g.step(NO_INPUT);
    expect(g.grid.count(MAT.rock)).toBeLessThan(rock0);
    const w = g.wyrm!;
    // Consecutive segments stay about `spacing` apart.
    for (let i = 1; i < w.segments.length; i++) {
      const a = w.segments[i - 1]!;
      const b = w.segments[i]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(WYRM.spacing * 1.6);
    }
  });

  it('telegraphs its lunge: a full windup before it strikes', () => {
    const g = Game.fromAscii(lair, 3);
    const w = g.wyrm!;
    const states: string[] = [];
    for (let t = 0; t < 2400 && !states.includes('lunge'); t++) {
      g.step(NO_INPUT);
      states.push(w.state);
      if (g.player.dead) break;
    }
    const first = states.indexOf('lunge');
    expect(first).toBeGreaterThan(0);
    const windup = states.slice(0, first).reverse().findIndex((s) => s !== 'windup');
    expect(windup === -1 ? first : windup).toBeGreaterThanOrEqual(WYRM.windupTicks);
  });
});

describe('a full run can be completed', () => {
  it('six levels, the shrines, the Wyrm, its eye: a won run, recorded in the Codex', () => {
    const codex = new Codex(new MemoryStore());
    const run = new Run(4242, 'run', LEVELS, '', codex);
    expect(run.totalLevels).toBe(7);
    while (!run.isBossLevel) {
      const e = run.game.features.portal!;
      run.game.player.body.x = e.x + 0.5;
      run.game.player.body.y = e.y + 0.5;
      run.step(NO_INPUT);
      expect(run.phase).toBe('shrine');
      run.choose(0);
      if (run.phase === 'shrine') run.descend();
    }
    expect(run.place).toBe("The Wyrm's Lair");
    const g = run.game;
    g.player.hp = 1e9;
    const w = g.wyrm!;
    // Bring each segment its weakness until the Wyrm comes apart.
    for (let t = 0; t < 6000 && !w.defeated; t++) {
      for (const s of w.segments) douse(g, s, s.weakTo);
      run.step(NO_INPUT);
    }
    expect(w.defeated).toBe(true);
    for (let t = 0; t < 10; t++) run.step(NO_INPUT);
    const L = g.features.legendary!;
    expect(L).not.toBeNull();
    expect(run.phase).toBe('level'); // not won until the eye is taken
    g.player.body.x = L.x;
    g.player.body.y = L.y;
    g.player.body.vx = 0;
    g.player.body.vy = 0;
    run.step(NO_INPUT);
    expect(run.phase).toBe('won');
    expect(run.postcard()).toContain('made it out alive');
    expect(run.postcard()).toContain('depth 7/7');
    expect(codex.recentRuns()[0]!.ending).toBe('made it out alive');
  });
});
