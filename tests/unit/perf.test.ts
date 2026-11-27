import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/core/grid';
import { Rng } from '../../src/core/rng';
import { Simulation } from '../../src/core/sim';
import { MAT } from '../../src/data/materials';

/**
 * Headless performance check on a busy 256x144 world. Logs the average tick
 * time; fails only on a large regression (the in-game budget is 4 ms/tick and
 * is watched in the F3 overlay).
 */
function busyWorld(seed: number): Simulation {
  const W = 256;
  const H = 144;
  const g = new Grid(W, H, seed);
  const rng = new Rng(seed);
  // Rock shell with shelves, then random blobs of every material.
  for (let x = 0; x < W; x++) {
    g.set(x, 0, MAT.rock);
    g.set(x, H - 1, MAT.rock);
  }
  for (let y = 0; y < H; y++) {
    g.set(0, y, MAT.rock);
    g.set(W - 1, y, MAT.rock);
  }
  for (let s = 0; s < 14; s++) {
    const y = 12 + s * 9;
    const x0 = rng.int(W - 60);
    for (let x = x0; x < x0 + 40 + rng.int(20); x++) g.set(x, y, s % 3 === 0 ? MAT.wood : MAT.rock);
  }
  const mats = [MAT.sand, MAT.water, MAT.oil, MAT.water, MAT.sand, MAT.steam, MAT.fire, MAT.wood];
  for (let b = 0; b < 120; b++) {
    const m = mats[b % mats.length]!;
    const cx = 2 + rng.int(W - 4);
    const cy = 2 + rng.int(H - 4);
    const r = 3 + rng.int(6);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && g.get(x, y) === MAT.empty) g.set(x, y, m);
      }
    }
  }
  return new Simulation(g, seed);
}

describe('simulation performance', () => {
  it('a busy 256x144 world ticks well within a generous threshold', () => {
    const sim = busyWorld(3);
    for (let t = 0; t < 30; t++) sim.step(); // warm up the JIT
    const ticks = 300;
    const start = performance.now();
    let activeSum = 0;
    for (let t = 0; t < ticks; t++) {
      sim.step();
      activeSum += sim.activeChunkCount;
    }
    const avg = (performance.now() - start) / ticks;
    const chunks = sim.chunkActive.length;
    console.log(
      `[perf] busy 256x144: ${avg.toFixed(3)} ms/tick avg over ${ticks} ticks, ` +
        `${(activeSum / ticks).toFixed(0)}/${chunks} chunks active on average`,
    );
    // Budget in game is 4 ms. 25 ms only catches large regressions on slow CI machines.
    expect(avg).toBeLessThan(25);
  });
});

describe('casting performance', () => {
  it('a click at the per-click caps (32 carriers, 400 cells) stays cheap', async () => {
    const { Game, tickInput } = await import('../../src/game/game');
    const { Wand } = await import('../../src/game/wand');
    const rows = ['#'.repeat(120)];
    for (let y = 0; y < 60; y++) rows.push('#' + ' '.repeat(118) + '#');
    rows.push('#'.repeat(120));
    rows[58] = '#' + ' '.repeat(10) + '@' + ' '.repeat(107) + '#';
    const g = Game.fromAscii(rows.join('\n'), 1);
    // A test wand big enough to hit the caps; every glyph owned and charged.
    const wand = new Wand({ slots: 32, maxMana: 10_000, manaRegen: 0, castDelayTicks: 0, rechargeTicks: 0 });
    g.wands[0] = wand;
    for (const m of [MAT.water, MAT.fire, MAT.sand, MAT.oil]) g.pouch.add(m, 50);
    const c = wand.compile('[+++++>~^.=]9', () => true);
    expect(c.ok).toBe(true);
    wand.spell = c;
    expect(c.plan.carriers).toBeLessThanOrEqual(32);
    let worst = 0;
    const start = performance.now();
    for (let t = 0; t < 240; t++) {
      const t0 = performance.now();
      g.step(tickInput({ cast: t === 0, aimX: 100, aimY: 30 }));
      worst = Math.max(worst, performance.now() - t0);
    }
    const avg = (performance.now() - start) / 240;
    console.log(`[perf] capped click: ${avg.toFixed(3)} ms/tick avg, worst ${worst.toFixed(2)} ms`);
    expect(worst).toBeLessThan(40); // generous: the budget is 4 ms; this only catches blowups
  });
});

describe('creature performance', () => {
  it('40 hunting creatures stay well inside the tick budget', async () => {
    const { Game, NO_INPUT } = await import('../../src/game/game');
    const rows = ['#'.repeat(160)];
    for (let y = 0; y < 60; y++) rows.push('#' + ' '.repeat(158) + '#');
    rows.push('#'.repeat(160));
    rows[58] = '#' + ' '.repeat(78) + '@' + ' '.repeat(79) + '#';
    const g = Game.fromAscii(rows.join('\n'), 1);
    g.player.hp = 1e9;
    const keys = ['bat', 'slime', 'imp', 'toad', 'golem'] as const;
    for (let i = 0; i < 40; i++) g.spawnCreature(keys[i % 5]!, 10 + i * 3.5, 20 + (i % 7) * 5);
    for (let t = 0; t < 30; t++) g.step(NO_INPUT);
    const ticks = 300;
    const start = performance.now();
    for (let t = 0; t < ticks; t++) g.step(NO_INPUT);
    const avg = (performance.now() - start) / ticks;
    console.log(`[perf] 40 creatures: ${avg.toFixed(3)} ms/tick avg (${g.creatures.length} alive at the end)`);
    expect(avg).toBeLessThan(8);
  });
});
