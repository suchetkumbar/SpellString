import { describe, expect, it } from 'vitest';
import { Game, NO_INPUT } from '../../src/game/game';
import { TUNING } from '../../src/data/tuning';

const ROOM = `
  ##########
  #   @    #
  #        #
  ##########
`;

const STEP = TUNING.playerFreeMoveSpeed / TUNING.simHz;

describe('Game (M1 free movement)', () => {
  it('spawns the player at the @ marker, centered in the cell', () => {
    const g = Game.fromAscii(ROOM, 1);
    expect(g.player.x).toBe(4.5);
    expect(g.player.y).toBe(1.5);
  });

  it('moves at the tuned speed and records the previous position', () => {
    const g = Game.fromAscii(ROOM, 1);
    g.step({ moveX: 1, moveY: 0 });
    expect(g.player.prevX).toBe(4.5);
    expect(g.player.x).toBeCloseTo(4.5 + STEP, 10);
    expect(g.tick).toBe(1);
  });

  it('normalizes diagonal movement', () => {
    const g = Game.fromAscii(ROOM, 1);
    g.step({ moveX: 1, moveY: 1 });
    expect(Math.hypot(g.player.x - 4.5, g.player.y - 1.5)).toBeCloseTo(STEP, 10);
  });

  it('stays inside the level bounds', () => {
    const g = Game.fromAscii(ROOM, 1);
    for (let i = 0; i < 1000; i++) g.step({ moveX: -1, moveY: -1 });
    expect(g.player.x).toBe(0.5);
    expect(g.player.y).toBe(0.5);
    g.step(NO_INPUT);
    expect(g.player.prevX).toBe(0.5);
  });

  it('is deterministic for the same inputs', () => {
    const run = (): number[] => {
      const g = Game.fromAscii(ROOM, 42);
      for (let i = 0; i < 120; i++) g.step({ moveX: i % 3 === 0 ? 1 : -1, moveY: i % 5 === 0 ? 1 : 0 });
      return [g.player.x, g.player.y, g.rng.state];
    };
    expect(run()).toEqual(run());
  });
});
