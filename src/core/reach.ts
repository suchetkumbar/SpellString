import type { Grid } from './grid';
import { BEH, behaviorOf } from './materialTable';

/**
 * Where can the witch get to? A breadth-first search over the cells she can
 * stand in (on something solid) or swim in, linked by the moves she can make:
 * walk, step up a 1-cell ledge, fall, jump (up to JUMP_UP cells, drifting
 * JUMP_SIDE cells sideways), swim in any direction, and leap out of a pool's
 * surface. It is a little conservative compared with the real physics, so
 * anything it calls reachable really is.
 */

/** Jump height used for planning (the real jump is about 4.6 cells). */
export const JUMP_UP = 4;
/** Sideways drift at the top of a jump (the real jump covers about 7 cells at full run). */
export const JUMP_SIDE = 3;
/** Leap out of a liquid surface (80% jump power, about 3.7 cells). */
export const LEAP_UP = 3;

export interface Reach {
  readonly width: number;
  readonly height: number;
  /** 1 for every reachable stand-or-swim cell. */
  readonly reached: Uint8Array;
  /** BFS parent of each reached cell (cell index), or -1 for the start. */
  readonly parent: Int32Array;
  readonly count: number;
}

/** Walls, wood and powders are solid to the witch. Everything else (air, liquid, gas, fire) she can be in. */
export function passableMat(m: number): boolean {
  const b = behaviorOf[m];
  return b !== BEH.static && b !== BEH.powder;
}

export function reachFrom(grid: Grid, sx: number, sy: number): Reach {
  const W = grid.width;
  const H = grid.height;
  const mat = grid.mat;
  const reached = new Uint8Array(W * H);
  const parent = new Int32Array(W * H).fill(-1);
  const passable = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && passableMat(mat[y * W + x] as number);
  const liquid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && behaviorOf[mat[y * W + x] as number] === BEH.liquid;
  const standable = (x: number, y: number): boolean => passable(x, y) && (!passable(x, y + 1) || liquid(x, y));
  /** Fall from a passable cell to where she comes to rest, or -1. */
  const land = (x: number, y: number): number => {
    while (y < H) {
      if (!passable(x, y)) return -1;
      if (standable(x, y)) return y;
      y++;
    }
    return -1;
  };

  const queue: number[] = [];
  let count = 0;
  let from = -1;
  const push = (x: number, y: number): void => {
    if (y < 0) return;
    const i = y * W + x;
    if (reached[i]) return;
    reached[i] = 1;
    parent[i] = from;
    queue.push(i);
    count++;
  };
  const fallTo = (x: number, y: number): void => {
    const l = land(x, y);
    if (l >= 0) push(x, l);
  };

  const sl = land(sx, sy);
  if (sl < 0) return { width: W, height: H, reached, parent, count };
  push(sx, sl);
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi] as number;
    from = i;
    const x = i % W;
    const y = (i - x) / W;
    const swimming = liquid(x, y);
    if (swimming) {
      // Swim in any direction; leaving the liquid sideways or down means falling.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!passable(nx, ny)) continue;
        if (liquid(nx, ny)) push(nx, ny);
        else fallTo(nx, ny);
      }
    }
    for (const dir of [-1, 1]) {
      // Walk (and fall off edges), or step up a 1-cell ledge.
      if (passable(x + dir, y)) fallTo(x + dir, y);
      else if (passable(x + dir, y - 1) && passable(x, y - 1)) fallTo(x + dir, y - 1);
    }
    // Jump (or leap out of a pool's surface): straight up, then drift sideways at that height.
    const up = swimming ? LEAP_UP : JUMP_UP;
    for (let h = 1; h <= up; h++) {
      if (!passable(x, y - h)) break;
      if (!swimming) fallTo(x, y - h);
      for (const dir of [-1, 1]) {
        for (let d = 1; d <= JUMP_SIDE; d++) {
          const cx = x + dir * d;
          if (!passable(cx, y - h)) break;
          fallTo(cx, y - h);
        }
      }
    }
  }
  return { width: W, height: H, reached, parent, count };
}

/** Can she reach cell (x, y)? Checks the cell itself, then the spot she'd land on below it. */
export function canReach(reach: Reach, grid: Grid, x: number, y: number): boolean {
  for (let yy = y; yy < reach.height && yy <= y + 2; yy++) {
    if (reach.reached[yy * reach.width + x]) return true;
    if (!passableMat(grid.get(x, yy))) break;
  }
  return false;
}

/** The BFS path from the start to (x, y), as cell indices (start first), or [] if unreached. */
export function pathTo(reach: Reach, x: number, y: number): number[] {
  let i = y * reach.width + x;
  if (!reach.reached[i]) return [];
  const path: number[] = [];
  while (i >= 0) {
    path.push(i);
    i = reach.parent[i] as number;
  }
  return path.reverse();
}
