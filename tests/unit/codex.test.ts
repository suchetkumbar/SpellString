import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/core/storage';
import { REACTIONS } from '../../src/data/reactions';
import { UNLOCKS } from '../../src/data/unlocks';
import { MAT } from '../../src/data/materials';
import { CODEX_ENTRIES, CODEX_KEY, Codex, entryText, reactionFormula } from '../../src/game/codex';
import { Game, NO_INPUT } from '../../src/game/game';
import { Run } from '../../src/game/run';

const testRoom = readFileSync(new URL('../../levels/test-room.txt', import.meta.url), 'utf8');
const tutorial = readFileSync(new URL('../../levels/tutorial.txt', import.meta.url), 'utf8');
const LEVELS = { testRoom, tutorial };

const formula = (id: string) => reactionFormula(REACTIONS.find((r) => r.id === id)!);

function reachExit(run: Run): void {
  const e = run.game.features.portal!;
  run.game.player.body.x = e.x + 0.5;
  run.game.player.body.y = e.y + 0.5;
  run.step(NO_INPUT);
}

describe('persistence', () => {
  it('discoveries, the journal and the starting wand survive a reload (mocked storage)', () => {
    const store = new MemoryStore();
    const a = new Codex(store);
    expect(a.discover('reaction', 'fire+water')).toEqual([]);
    expect(a.discover('reaction', 'fire+water')).toBeNull(); // already known
    a.discover('creature', 'bat');
    a.recordRun({ seed: 7, mode: 'run', depth: 2, totalLevels: 6, ending: 'killed by: b (a bat)', spell: '>~', best: '>~' }, new Map([['>~', 5], ['>', 2]]));

    const b = new Codex(store); // "reload"
    expect(b.has('reaction', 'fire+water')).toBe(true);
    expect(b.has('creature', 'bat')).toBe(true);
    expect(b.has('creature', 'imp')).toBe(false);
    expect(b.runCount).toBe(1);
    expect(b.recentRuns()[0]).toMatchObject({ seed: 7, spell: '>~' });
    expect(b.topSpells()).toEqual([{ spell: '>~', casts: 5 }, { spell: '>', casts: 2 }]);
  });

  it('starts empty on missing, corrupt or foreign data, and ignores unknown ids', () => {
    for (const bad of [null, 'not json', '{"v":2}', '[]', '{"v":1,"found":null}']) {
      const store = new MemoryStore();
      if (bad !== null) store.set(CODEX_KEY, bad);
      const c = new Codex(store);
      expect(c.count('reaction')).toBe(0);
      expect(c.runCount).toBe(0);
    }
    const store = new MemoryStore();
    store.set(CODEX_KEY, JSON.stringify({ v: 1, found: { reaction: ['fire+water', 'made+up', 3], material: ['water'] } }));
    const c = new Codex(store);
    expect(c.found('reaction')).toEqual(['fire+water']);
    expect(c.has('material', 'water')).toBe(true);
    expect(c.discover('reaction', 'made+up')).toBeNull();
  });

  it('the journal keeps the latest 20 runs and sums casts across runs', () => {
    const c = new Codex(new MemoryStore());
    for (let i = 0; i < 25; i++) {
      c.recordRun({ seed: i, mode: 'run', depth: 1, totalLevels: 6, ending: 'x', spell: '>', best: null }, new Map([['>', 1]]));
    }
    expect(c.recentRuns()).toHaveLength(20);
    expect(c.recentRuns()[0]!.seed).toBe(24);
    expect(c.topSpells()[0]).toEqual({ spell: '>', casts: 25 });
    expect(c.runCount).toBe(25);
  });
});

describe('formulas', () => {
  it('writes each reaction as glyphs', () => {
    expect(formula('fire+oil')).toBe('^ + = -> ^');
    expect(formula('fire+water')).toBe('^ + ~ -> "');
    expect(formula('fire+wood')).toBe('^ + | -> ^');
    expect(formula('steam>water')).toBe('" -> ~');
    expect(formula('fire>smoke')).toBe("^ -> '");
    expect(formula('smoke>empty')).toBe("' -> ·");
    expect(formula('acid+rock')).toBe('% + # -> ·');
    expect(formula('fire+ice')).toBe('^ + * -> ~');
    expect(formula('water+ice')).toBe('~ + * -> *');
    expect(formula('fire+gunpowder')).toBe('^ + : -> *boom*');
    for (const r of REACTIONS) expect(reactionFormula(r)).toMatch(/->/);
  });

  it('names materials, creatures and glyphs', () => {
    expect(entryText('material', 'water')).toBe('~  water');
    expect(entryText('creature', 'golem')).toBe('G  stone golem');
    expect(entryText('glyph', '!')).toBe('!  trigger');
    expect(CODEX_ENTRIES.glyph).not.toContain(']');
    expect(CODEX_ENTRIES.material).toHaveLength(12);
  });
});

describe('unlock rules', () => {
  const fill = (c: Codex, kind: 'reaction' | 'material' | 'creature', n: number) => {
    for (const id of CODEX_ENTRIES[kind].slice(0, n)) c.discover(kind, id);
  };

  it('every unlock opens exactly when its requirement is met', () => {
    for (const u of UNLOCKS) {
      const c = new Codex(new MemoryStore());
      expect(c.meets(u), u.id).toBe(false);
      const r = u.requires;
      let earned: string[] = [];
      const track = (res: ReturnType<Codex['discover']>) => {
        if (res) earned = earned.concat(res.map((x) => x.id));
      };
      if (r.reactions) {
        for (const id of CODEX_ENTRIES.reaction.slice(0, r.reactions - 1)) track(c.discover('reaction', id));
        expect(c.meets(u), `${u.id} one short`).toBe(false);
        track(c.discover('reaction', CODEX_ENTRIES.reaction[r.reactions - 1]!));
      }
      if (r.materials) for (const id of CODEX_ENTRIES.material.slice(0, r.materials)) track(c.discover('material', id));
      if (r.creatures) for (const id of CODEX_ENTRIES.creature.slice(0, r.creatures)) track(c.discover('creature', id));
      for (const id of r.ids ?? []) {
        const [kind, key] = id.split(':') as ['reaction', string];
        track(c.discover(kind, key));
      }
      expect(c.meets(u), u.id).toBe(true);
      expect(earned, u.id).toContain(u.id);
    }
  });

  it('shrines offer the base glyphs, plus unlocked ones', () => {
    const c = new Codex(new MemoryStore());
    expect([...c.shrineGlyphs()].sort()).toEqual([')', '+', '@', '_']);
    fill(c, 'reaction', 10);
    fill(c, 'material', 10);
    expect([...c.shrineGlyphs()].sort()).toEqual(['!', ')', '+', '?', '@', '[', '_']);
  });

  it('starting wands: plain always; others once unlocked; the choice persists', () => {
    const store = new MemoryStore();
    const c = new Codex(store);
    expect(c.startingWands().map((w) => w.id)).toEqual(['plain']);
    expect(c.cycleStartingWand().id).toBe('plain');
    fill(c, 'creature', 3);
    c.discover('reaction', 'fire+gunpowder');
    expect(c.startingWands().map((w) => w.id)).toEqual(['plain', 'lobber', 'sapper']);
    expect(c.cycleStartingWand().id).toBe('lobber');
    expect(new Codex(store).startingWand.id).toBe('lobber');
  });

  it('unlocks never touch stats: every starting wand has the same wand stats', async () => {
    const { STARTING_WANDS } = await import('../../src/data/unlocks');
    const { startingKit } = await import('../../src/game/run');
    const stats = STARTING_WANDS.map((w) => JSON.stringify(startingKit(w).wands[0]!.stats));
    expect(new Set(stats).size).toBe(1);
    for (const w of STARTING_WANDS) expect(startingKit(w).pouch.counts.every((n) => n === 0)).toBe(true);
  });
});

describe('discovery in play', () => {
  it('reactions, materials and creatures seen in a level are discovered, with a banner', () => {
    const codex = new Codex(new MemoryStore());
    const g = Game.fromAscii(
      `
      ####################
      #                  #
      #  @     b   ~~~   #
      #       ^^^~~~~~   #
      ####################`,
      1,
      { codex },
    );
    for (let t = 0; t < 120; t++) g.step(NO_INPUT);
    expect(codex.has('creature', 'bat')).toBe(true);
    expect(codex.has('material', 'water')).toBe(true);
    expect(codex.has('material', 'fire')).toBe(true);
    expect(codex.has('reaction', 'fire+water')).toBe(true);
    expect(codex.has('glyph', '>')).toBe(true);
    const banners = g.discoveries.map((d) => `${d.title} ${d.text}`);
    expect(banners).toContain('DISCOVERED ^ + ~ -> "');
    expect(banners).toContain('DISCOVERED b  bat');
  });

  it('a run with a Codex: journal on death, gated shrine offers, starting wand, Lab kit', () => {
    const codex = new Codex(new MemoryStore());
    // Gated: with a fresh Codex, shrines never offer ! ? [.
    const r1 = new Run(3, 'run', LEVELS, '', codex);
    for (let k = 0; k < 3; k++) {
      reachExit(r1);
      for (const o of r1.offers) if (o.kind === 'glyph') expect(['!', '?', '[']).not.toContain(o.glyph);
      r1.choose(0);
      if (r1.phase === 'shrine') r1.descend();
    }
    r1.game.player.hp = 0.5;
    r1.game.player.burning = 100;
    for (let t = 0; t < 30 && r1.phase === 'level'; t++) r1.step(NO_INPUT);
    expect(r1.phase).toBe('dead');
    expect(codex.runCount).toBe(1);
    expect(codex.recentRuns()[0]).toMatchObject({ seed: 3, depth: 4, ending: 'killed by: ^ (burning)', spell: '>' });

    // A chosen starting wand applies to runs (not dailies).
    for (const id of CODEX_ENTRIES.creature.slice(0, 3)) codex.discover('creature', id);
    codex.cycleStartingWand();
    expect(codex.startingWand.id).toBe('lobber');
    const r2 = new Run(4, 'run', LEVELS, '', codex);
    expect(r2.game.owns(')')).toBe(true);
    expect(r2.game.wand.spell.text).toBe(')');
    const daily = new Run(4, 'daily', LEVELS, 'daily 2026-11-27', codex);
    expect(daily.game.owns(')')).toBe(false);

    // Lab: exactly the glyphs and materials discovered.
    const lab = new Run(1, 'lab', LEVELS, '', codex);
    expect(lab.game.owns('>')).toBe(true);
    expect(lab.game.owns('!')).toBe(codex.has('glyph', '!'));
    expect(lab.game.pouch.count(MAT.gold)).toBe(codex.has('material', 'gold') ? 999 : 0);
    expect(lab.game.pouch.count(MAT.fire)).toBe(codex.has('material', 'fire') ? 50 : 0);
  });
});
