import { describe, expect, it } from 'vitest';
import { FixedStep } from '../../src/core/loop';

describe('FixedStep', () => {
  it('runs one step per 1/60 s on average', () => {
    const loop = new FixedStep(60, 5);
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += loop.advance(1000 / 60);
    expect(steps).toBeGreaterThanOrEqual(599);
    expect(steps).toBeLessThanOrEqual(600);
  });

  it('is independent of display rate (144 Hz and 30 Hz give the same tick count)', () => {
    const fast = new FixedStep(60, 5);
    const slow = new FixedStep(60, 5);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 144 * 10; i++) a += fast.advance(1000 / 144);
    for (let i = 0; i < 30 * 10; i++) b += slow.advance(1000 / 30);
    expect(Math.abs(a - 600)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 600)).toBeLessThanOrEqual(1);
  });

  it('caps catch-up steps and drops the backlog', () => {
    const loop = new FixedStep(60, 5, 1000);
    expect(loop.advance(500)).toBe(5);
    expect(loop.droppedSteps).toBe(25);
    expect(loop.advance(0)).toBe(0);
  });

  it('clamps huge frame deltas', () => {
    const loop = new FixedStep(60, 100, 250);
    expect(loop.advance(10_000)).toBe(15);
  });

  it('exposes an interpolation alpha in [0, 1)', () => {
    const loop = new FixedStep(60, 5);
    loop.advance(1000 / 120);
    expect(loop.alpha).toBeCloseTo(0.5, 5);
    loop.advance(1000 / 120);
    expect(loop.alpha).toBeLessThan(1);
  });
});
