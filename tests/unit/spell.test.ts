import { describe, expect, it } from 'vitest';
import { MAT } from '../../src/data/materials';
import { TUNING } from '../../src/data/tuning';
import { Rng } from '../../src/core/rng';
import { parseSpell, tokenize, type CastNode, type LoopNode } from '../../src/game/spell/parse';
import { buildPlan, chargesNeeded, DEFAULT_LIMITS } from '../../src/game/spell/plan';
import { compileSpell, firstRejected } from '../../src/game/spell/compile';

const C = TUNING.spellCost;

function ok(text: string): ReturnType<typeof parseSpell> {
  const r = parseSpell(text);
  expect(r.errors, `errors for '${text}'`).toEqual([]);
  return r;
}

function codes(text: string, opts: Parameters<typeof parseSpell>[1] = {}): string[] {
  return parseSpell(text, opts).errors.map((e) => e.code);
}

function firstError(text: string, opts: Parameters<typeof parseSpell>[1] = {}) {
  const e = parseSpell(text, opts).errors[0];
  expect(e, `expected an error for '${text}'`).toBeDefined();
  return e!;
}

describe('tokenizer', () => {
  it('every non-space character takes one slot; spaces take none', () => {
    const t = tokenize('> ~ ^');
    expect(t.map((x) => x.ch)).toEqual(['>', '~', '^']);
    expect(t.map((x) => x.slot)).toEqual([0, 1, 2]);
    expect(t.map((x) => x.pos)).toEqual([0, 2, 4]);
    expect(parseSpell('>.3').slotsUsed).toBe(3);
    expect(parseSpell('[>.]4').slotsUsed).toBe(5);
  });

  it('classifies glyphs', () => {
    expect(tokenize('>)@_~+3!?[]k').map((x) => x.kind)).toEqual([
      'delivery', 'delivery', 'delivery', 'delivery', 'matter', 'split', 'digit', 'trigger', 'chaos', 'open', 'close', 'unknown',
    ]);
    expect(tokenize('~')[0]!.material).toBe(MAT.water);
  });
});

describe('parser: the example spells', () => {
  it('>~ water bolt', () => {
    const [c] = ok('>~').groups as CastNode[];
    expect(c).toMatchObject({ kind: 'cast', delivery: '>', split: 0, trigger: null });
    expect(c!.payload).toEqual([{ kind: 'matter', material: MAT.water, count: 1, pos: 1 }]);
  });

  it('>^ fire bolt', () => {
    const [c] = ok('>^').groups as CastNode[];
    expect(c!.payload).toMatchObject([{ material: MAT.fire, count: 1 }]);
  });

  it('>.3 sand bolt: the digit repeats the glyph before it', () => {
    const [c] = ok('>.3').groups as CastNode[];
    expect(c!.payload).toMatchObject([{ material: MAT.sand, count: 3 }]);
  });

  it('>~^ steam burst: two matter glyphs in one payload', () => {
    const [c] = ok('>~^').groups as CastNode[];
    expect(c!.payload.map((p) => (p.kind === 'matter' ? p.material : -1))).toEqual([MAT.water, MAT.fire]);
  });

  it(')=3 big oil lob', () => {
    const [c] = ok(')=3').groups as CastNode[];
    expect(c).toMatchObject({ delivery: ')', payload: [{ material: MAT.oil, count: 3 }] });
  });

  it('+>^ three fire bolts', () => {
    const [c] = ok('+>^').groups as CastNode[];
    expect(c).toMatchObject({ delivery: '>', split: 1, payload: [{ material: MAT.fire }] });
  });

  it('a new delivery glyph starts a new cast', () => {
    const g = ok('>~)^').groups as CastNode[];
    expect(g.map((c) => c.delivery)).toEqual(['>', ')']);
  });

  it('a delivery with no payload is a kinetic shot', () => {
    const [c] = ok('>').groups as CastNode[];
    expect(c!.payload).toEqual([]);
  });

  // Milestone 7 glyphs already parse (they just can't be owned yet).
  it('>!)~5 trigger: the rest of the group fires from the impact point', () => {
    const [c] = ok('>!)~5').groups as CastNode[];
    expect(c!.delivery).toBe('>');
    expect(c!.trigger).toHaveLength(1);
    expect(c!.trigger![0]).toMatchObject({ kind: 'cast', delivery: ')', payload: [{ material: MAT.water, count: 5 }] });
  });

  it('[>.]4 loop', () => {
    const [l] = ok('[>.]4').groups as LoopNode[];
    expect(l).toMatchObject({ kind: 'loop', count: 4 });
    expect(l!.body[0]).toMatchObject({ kind: 'cast', delivery: '>', payload: [{ material: MAT.sand }] });
  });

  it('a trigger inside a loop stops at the matching ]', () => {
    const [l, after] = ok('[>!>~]2)').groups;
    expect(l).toMatchObject({ kind: 'loop', count: 2 });
    const inner = (l as LoopNode).body[0] as CastNode;
    expect(inner.trigger).toHaveLength(1);
    expect(after).toMatchObject({ kind: 'cast', delivery: ')' });
  });

  it('_ mine and @ self parse as deliveries', () => {
    expect((ok('_^').groups[0] as CastNode).delivery).toBe('_');
    expect((ok('@~3').groups[0] as CastNode).delivery).toBe('@');
  });
});

describe('parser: friendly errors point at the character at fault', () => {
  it('matter before any delivery', () => {
    const e = firstError('~>');
    expect(e.code).toBe('matterFirst');
    expect(e.pos).toBe(0);
    expect(e.message).toBe('Start with a delivery glyph, like `>`.');
    // After a loop, matter still needs its own delivery.
    expect(firstError('[>]2~')).toMatchObject({ code: 'matterFirst', pos: 4 });
  });

  it('unknown glyph', () => {
    expect(firstError('>k')).toMatchObject({ code: 'unknownGlyph', pos: 1 });
    expect(firstError('>k').message).toContain('`k`');
  });

  it('unowned glyph', () => {
    const owns = (ch: string) => ch !== '~' && ch !== '_';
    expect(firstError('>~', { owns })).toMatchObject({ code: 'unownedGlyph', pos: 1 });
    expect(firstError('>~', { owns }).message).toContain('harvest');
    expect(firstError('_^', { owns })).toMatchObject({ code: 'unownedGlyph', pos: 0 });
    expect(firstError('_^', { owns }).message).toContain("don't know");
  });

  it('a ! with nothing after it', () => {
    expect(codes('>~!')).toEqual(['triggerEmpty']);
    expect(firstError('>~!').pos).toBe(2);
    expect(codes('[>!]2')).toEqual(['triggerEmpty']);
    expect(codes('!>')).toEqual(['triggerPlace']);
  });

  it('an unclosed [', () => {
    expect(codes('[>.')).toEqual(['unclosedLoop']);
    expect(firstError('>[>.').pos).toBe(1);
    expect(codes('>]')).toEqual(['unmatchedClose']);
    expect(codes('[>]')).toEqual(['loopCount']);
    expect(codes('[]3')).toEqual(['emptyLoop']);
  });

  it('a digit in the wrong place', () => {
    expect(firstError('3>')).toMatchObject({ code: 'digitPlace', pos: 0 });
    expect(firstError('>3')).toMatchObject({ code: 'digitPlace', pos: 1 });
    expect(firstError('>~33')).toMatchObject({ code: 'digitPlace', pos: 3 });
    expect(firstError('>~1')).toMatchObject({ code: 'digitPlace', pos: 2 });
    expect(firstError('>~1').message).toContain('2 to 9');
    expect(firstError('>?2')).toMatchObject({ code: 'digitPlace', pos: 2 });
    expect(firstError('[>]1')).toMatchObject({ code: 'digitPlace', pos: 3 });
  });

  it('a spell too long for the wand', () => {
    const e = firstError('>~^.=', { slots: 4 });
    expect(e).toMatchObject({ code: 'tooLong', pos: 4 });
    expect(e.message).toBe('This wand holds 4 glyphs; the spell has 5.');
    expect(codes('> ~ ^ .', { slots: 4 })).toEqual([]); // spaces are free
  });

  it('a dangling + and an empty spell', () => {
    expect(codes('+~')).toEqual(['splitPlace', 'matterFirst']);
    expect(codes('>+')).toEqual(['splitPlace']);
    expect(codes('')).toEqual(['empty']);
    expect(codes('   ')).toEqual(['empty']);
  });

  it('reports several errors, sorted by position', () => {
    const r = parseSpell('k>3~!');
    expect(r.errors.map((e) => e.pos)).toEqual([0, 2, 4]);
  });
});

describe('interpreter: cast plans', () => {
  const plan = (s: string) => compileSpell(s).plan;

  it('mana is the sum over the expanded spell: digits save slots, not mana', () => {
    expect(plan('>').manaCost).toBe(C.delivery);
    expect(plan('>~').manaCost).toBe(C.delivery + C.matter);
    expect(plan('>^').manaCost).toBe(C.delivery + C.matter);
    expect(plan('>.3').manaCost).toBe(C.delivery + 3 * C.matter);
    expect(plan('>~^').manaCost).toBe(C.delivery + 2 * C.matter);
    expect(plan(')=3').manaCost).toBe(C.delivery + 3 * C.matter);
    expect(plan('+>^').manaCost).toBe(C.split + C.delivery + C.matter);
    expect(plan('[>.]4').manaCost).toBe(C.loop + 4 * (C.delivery + C.matter));
    expect(plan('>!)~5').manaCost).toBe(C.delivery + C.trigger + C.delivery + 5 * C.matter);
    expect(plan('>?').manaCost).toBe(C.delivery + C.chaos);
  });

  it('expands digits into payloads and + into fanned carriers', () => {
    expect(plan('>.3').casts).toEqual([{ delivery: '>', carriers: 1, payload: [MAT.sand, MAT.sand, MAT.sand], trigger: [] }]);
    expect(plan(')=3').casts[0]).toMatchObject({ delivery: ')', payload: [MAT.oil, MAT.oil, MAT.oil] });
    expect(plan('+>^').casts[0]).toMatchObject({ carriers: 3, payload: [MAT.fire] });
    expect(plan('++>').casts[0]!.carriers).toBe(5);
    expect(plan('>~^').casts[0]!.payload).toEqual([MAT.water, MAT.fire]);
  });

  it('each released matter glyph spends a charge: +>~ needs three water', () => {
    expect(chargesNeeded(plan('+>~')).get(MAT.water)).toBe(3);
    expect(chargesNeeded(plan('>~^')).get(MAT.fire)).toBe(1);
    expect(chargesNeeded(plan('[>.]4')).get(MAT.sand)).toBe(4);
  });

  it('loops expand in order; triggers nest under their cast', () => {
    expect(plan('[>.]4').casts).toHaveLength(4);
    const t = plan('>!)~5').casts;
    expect(t).toHaveLength(1);
    expect(t[0]!.trigger[0]).toMatchObject({ delivery: ')', payload: [MAT.water, MAT.water, MAT.water, MAT.water, MAT.water] });
  });

  it('caps carriers per click and says so', () => {
    const p = plan('[[>]9]9'); // 81 bolts asked for
    expect(p.carriers).toBe(DEFAULT_LIMITS.carriers);
    expect(p.casts).toHaveLength(DEFAULT_LIMITS.carriers);
    expect(p.cutOff).toBe('carriers');
  });

  it('caps released cells per click', () => {
    const p = plan('+++>~9'); // 7 carriers x 9 glyphs x 12 cells = 756
    expect(p.cells).toBeLessThanOrEqual(DEFAULT_LIMITS.cells);
    expect(p.casts[0]!.carriers).toBe(Math.floor(DEFAULT_LIMITS.cells / (9 * TUNING.burstCellsPerGlyph)));
    expect(p.cutOff).toBe('cells');
    expect(plan('>~3').cutOff).toBeNull();
  });

  it('caps trigger depth', () => {
    const p = plan('>!>!>!>!>!>');
    expect(p.cutOff).toBe('depth');
    let depth = 0;
    for (let c = p.casts[0]; c && c.trigger.length; c = c.trigger[0]) depth++;
    expect(depth).toBe(DEFAULT_LIMITS.triggerDepth);
  });

  it('triggers count toward the caps once per carrier', () => {
    const p = plan('++>!>'); // 5 carriers, each triggering 1
    expect(p.carriers).toBe(10);
  });

  it('nothing hangs: deep loops stop expanding at the cap', () => {
    const t0 = performance.now();
    const p = plan('[[[[[[>~]9]9]9]9]9]9');
    expect(performance.now() - t0).toBeLessThan(50);
    expect(p.carriers).toBeLessThanOrEqual(DEFAULT_LIMITS.carriers);
    expect(p.cells).toBeLessThanOrEqual(DEFAULT_LIMITS.cells);
  });

  it('fuzz: random spells never throw, hang or exceed a cap', () => {
    const alphabet = '>)@_~^.=#|"\'+!?[]0123456789 k';
    const rng = new Rng(1234);
    const t0 = performance.now();
    for (let n = 0; n < 3000; n++) {
      let s = '';
      const len = rng.int(40);
      for (let i = 0; i < len; i++) s += alphabet[rng.int(alphabet.length)];
      const c = compileSpell(s, { slots: rng.chance(0.5) ? 4 : undefined });
      expect(c.plan.carriers).toBeLessThanOrEqual(DEFAULT_LIMITS.carriers);
      expect(c.plan.cells).toBeLessThanOrEqual(DEFAULT_LIMITS.cells);
      for (const e of c.parse.errors) {
        expect(e.message.length).toBeGreaterThan(0);
        expect(e.pos).toBeLessThan(Math.max(1, s.length));
      }
      if (c.ok) expect(c.plan.casts.length).toBeGreaterThan(0);
    }
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('builds a plan even from a spell with errors (for the editor), but it is not ok', () => {
    const c = compileSpell('>~k');
    expect(c.ok).toBe(false);
    expect(c.plan.manaCost).toBe(C.delivery + C.matter);
    expect(buildPlan([]).casts).toEqual([]);
  });
});

describe('editor typing filter', () => {
  const owns = (ch: string) => ['>', ')', '+', '~', '3'].includes(ch);

  it('accepts owned glyphs and spaces', () => {
    expect(firstRejected('>~3', owns)).toBeNull();
    expect(firstRejected('> ~', owns)).toBeNull();
    expect(firstRejected('', owns)).toBeNull();
  });

  it('rejects the first glyph you do not own, and unknown characters', () => {
    expect(firstRejected('^', owns)).toBe('^');
    expect(firstRejected('>~^.', owns)).toBe('^');
    expect(firstRejected('k', owns)).toBe('k');
    expect(firstRejected('_', owns)).toBe('_');
  });
});
