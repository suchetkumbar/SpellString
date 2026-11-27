import { describe, expect, it } from 'vitest';
import { Rng, hash2, hashString } from '../../src/core/rng';

describe('Rng (mulberry32)', () => {
  it('is deterministic: the same seed gives the same sequence', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 10_000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('matches golden values (guards against accidental algorithm changes)', () => {
    const r = new Rng(48213);
    expect(Array.from({ length: 5 }, () => r.nextU32())).toEqual([
      1436899660, 3285982858, 2603564073, 260109684, 3825644999,
    ]);
    expect(hashString('spellstring')).toBe(3740693604);
  });

  it('gives different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 100 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it('can save and restore state mid-sequence', () => {
    const r = new Rng(99);
    for (let i = 0; i < 37; i++) r.next();
    const saved = r.state;
    const expected = Array.from({ length: 20 }, () => r.next());
    r.state = saved;
    expect(Array.from({ length: 20 }, () => r.next())).toEqual(expected);
  });

  it('keeps helpers within their ranges', () => {
    const r = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const f = r.next();
      expect(f >= 0 && f < 1).toBe(true);
      const n = r.int(10);
      expect(Number.isInteger(n) && n >= 0 && n < 10).toBe(true);
      const k = r.intRange(-3, 3);
      expect(k >= -3 && k <= 3).toBe(true);
      const x = r.range(2, 5);
      expect(x >= 2 && x < 5).toBe(true);
    }
  });

  it('is roughly uniform', () => {
    const r = new Rng(2024);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const b = r.int(10);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 100);
  });

  it('fork() is deterministic and does not advance the parent', () => {
    const a = new Rng(5);
    const before = a.state;
    const f1 = a.fork(1).nextU32();
    expect(a.state).toBe(before);
    expect(new Rng(5).fork(1).nextU32()).toBe(f1);
    expect(new Rng(5).fork(2).nextU32()).not.toBe(f1);
  });

  it('hash2 is pure and position-sensitive', () => {
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1));
    expect(hash2(3, 4, 1)).not.toBe(hash2(4, 3, 1));
    expect(hash2(3, 4, 1)).not.toBe(hash2(3, 4, 2));
  });
});
