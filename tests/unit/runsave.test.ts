import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/core/storage';
import { MAT } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';
import { Codex } from '../../src/game/codex';
import { NO_INPUT } from '../../src/game/game';
import { Run } from '../../src/game/run';
import { clearRunSave, readRunSave, RUN_SAVE_KEY, writeRunSave } from '../../src/game/runsave';
import { Wand } from '../../src/game/wand';

const read = (f: string) => readFileSync(new URL(`../../levels/${f}`, import.meta.url), 'utf8');
const LEVELS = { lair: read('wyrm-lair.txt'), testRoom: read('test-room.txt'), tutorial: read('tutorial.txt') };

describe('save and quit between levels', () => {
  it('a run saved at a shrine continues on the next level with the same kit', () => {
    const run = new Run(777, 'run', LEVELS);
    const g = run.game;
    g.pouch.add(MAT.water, 23);
    g.pouch.add(MAT.gold, 140);
    g.known.add(')');
    g.wands.push(new Wand({ slots: 6, maxMana: 160, manaRegen: 16, castDelayTicks: 6, rechargeTicks: 32 }));
    expect(g.wands[1]!.write(')~', g.owns).ok).toBe(true);
    g.activeWand = 1;
    g.stats.countCast(')~');
    g.player.hp = 50;
    const e = g.features.portal!;
    g.player.body.x = e.x + 0.5;
    g.player.body.y = e.y + 0.5;
    run.step(NO_INPUT);
    expect(run.phase).toBe('shrine');

    const store = new MemoryStore();
    const save = run.saveAndQuit()!;
    writeRunSave(store, save);
    const loaded = readRunSave(store)!;
    expect(loaded.depth).toBe(2);

    const r2 = Run.resume(loaded, LEVELS);
    expect(r2.depth).toBe(2);
    expect(r2.place).toBe('Sandstone Hollows 1-2');
    const g2 = r2.game;
    expect(g2.player.hp).toBe(50 + TUNING.shrineHeal);
    expect(g2.pouch.count(MAT.water)).toBe(23);
    expect(g2.pouch.count(MAT.gold)).toBe(140);
    expect(g2.owns(')')).toBe(true);
    expect(g2.owns('~')).toBe(true);
    expect(g2.wands).toHaveLength(2);
    expect(g2.activeWand).toBe(1);
    expect(g2.wand.spell.text).toBe(')~');
    expect(g2.wand.stats.slots).toBe(6);
    expect(g2.stats.casts.get(')~')).toBe(1);

    // The level is the same one a straight descent would have reached.
    const straight = new Run(777, 'run', LEVELS);
    const se = straight.game.features.portal!;
    straight.game.player.body.x = se.x + 0.5;
    straight.game.player.body.y = se.y + 0.5;
    straight.step(NO_INPUT);
    straight.descend();
    expect(Array.from(g2.grid.mat)).toEqual(Array.from(straight.game.grid.mat));
  });

  it('only at a shrine, only for descents; bad saves read as none', () => {
    const run = new Run(1, 'run', LEVELS);
    expect(run.saveAndQuit()).toBeNull(); // mid-level
    expect(new Run(1, 'tutorial', LEVELS).saveAndQuit()).toBeNull();
    const store = new MemoryStore();
    expect(readRunSave(store)).toBeNull();
    store.set(RUN_SAVE_KEY, 'garbage');
    expect(readRunSave(store)).toBeNull();
    store.set(RUN_SAVE_KEY, '{"v":2}');
    expect(readRunSave(store)).toBeNull();
    clearRunSave(store);
    expect(store.get(RUN_SAVE_KEY)).toBeNull();
  });
});

describe('lifetime stats (for balancing)', () => {
  it('count deaths by cause, where runs ended, and wins', () => {
    const codex = new Codex(new MemoryStore());
    const rec = (ending: string, depth: number) =>
      codex.recordRun({ seed: 1, mode: 'run', depth, totalLevels: 7, ending, spell: '>', best: null }, new Map());
    rec('killed by: b (a bat)', 1);
    rec('killed by: b (a bat)', 2);
    rec('killed by: ^ (your own fire)', 2);
    rec('made it out alive', 7);
    expect(codex.stats.deaths).toEqual({ 'b (a bat)': 2, '^ (your own fire)': 1 });
    expect(codex.stats.depths[2]).toBe(2);
    expect(codex.stats.depths[7]).toBe(1);
    expect(codex.stats.wins).toBe(1);
  });
});
