import type { Grid } from '../core/grid';
import { BEH, behaviorOf } from '../core/materialTable';

/**
 * An axis-aligned box moving through the cell grid with continuous position.
 * Static cells and powders are solid. Movement is swept in substeps no longer
 * than MAX_SUBSTEP, and every substep that would overlap a solid snaps to that
 * cell's edge, so nothing can tunnel through a 1-cell wall at any speed.
 */
export interface Body {
  /** Center, in cell units. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly hw: number;
  readonly hh: number;
  grounded: boolean;
  /**
   * Cell indices to treat as non-solid this tick: powders the body is already
   * inside (it was buried), so it can wriggle and dig its way out.
   */
  ignore: number[];
}

/** Longest move per collision check, in cells. Smaller than any hitbox dimension. */
const MAX_SUBSTEP = 0.2;
/** Keeps snapped edges a hair off cell boundaries so floor() never lands on the wall. */
const EPS = 1e-4;
/** Bound on substeps per axis per move; longer moves are clamped, never coarsened. */
const MAX_SUBSTEPS = 2000;
const MAX_MOVE = MAX_SUBSTEP * MAX_SUBSTEPS;

export function isSolid(m: number): boolean {
  const b = behaviorOf[m];
  return b === BEH.static || b === BEH.powder;
}

/** Inclusive cell range covered by [lo, hi). */
function cellLo(v: number): number {
  return Math.floor(v);
}
function cellHi(v: number): number {
  return Math.floor(v - 1e-7);
}

/** True if the box centered at (x, y) overlaps any solid cell (out of bounds counts as solid). */
export function boxBlocked(grid: Grid, body: Body, x: number, y: number): boolean {
  const x0 = cellLo(x - body.hw);
  const x1 = cellHi(x + body.hw);
  const y0 = cellLo(y - body.hh);
  const y1 = cellHi(y + body.hh);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const m = grid.get(cx, cy);
      if (!isSolid(m)) continue;
      if (body.ignore.length > 0 && grid.inBounds(cx, cy) && body.ignore.includes(cy * grid.width + cx)) continue;
      return true;
    }
  }
  return false;
}

/** Visit every in-bounds cell the box overlaps. */
export function forEachOverlap(grid: Grid, body: Body, visit: (x: number, y: number, i: number, m: number) => void): void {
  const x0 = Math.max(0, cellLo(body.x - body.hw));
  const x1 = Math.min(grid.width - 1, cellHi(body.x + body.hw));
  const y0 = Math.max(0, cellLo(body.y - body.hh));
  const y1 = Math.min(grid.height - 1, cellHi(body.y + body.hh));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const i = cy * grid.width + cx;
      visit(cx, cy, i, grid.mat[i] as number);
    }
  }
}

/** Remember powders the body currently overlaps, so they don't trap it. Returns how many. */
export function refreshBuried(grid: Grid, body: Body): number {
  body.ignore.length = 0;
  forEachOverlap(grid, body, (_x, _y, i, m) => {
    if (behaviorOf[m] === BEH.powder) body.ignore.push(i);
  });
  return body.ignore.length;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  /** Hit the ground while moving down. */
  landed: boolean;
  /** Bumped a ceiling while moving up. */
  bonked: boolean;
}

/**
 * Move by (dx, dy): X first (with automatic step-up onto ledges up to `stepUp`
 * cells high when `canStep`), then Y. Velocity on a blocked axis is zeroed.
 */
export function moveBody(grid: Grid, body: Body, dx: number, dy: number, stepUp: number, canStep: boolean): MoveResult {
  const res: MoveResult = { hitX: false, hitY: false, landed: false, bonked: false };
  dx = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dx));
  dy = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dy));

  // --- X axis
  if (dx !== 0) {
    const n = Math.min(MAX_SUBSTEPS, Math.ceil(Math.abs(dx) / MAX_SUBSTEP));
    const step = dx / n;
    for (let k = 0; k < n; k++) {
      const nx = body.x + step;
      if (!boxBlocked(grid, body, nx, body.y)) {
        body.x = nx;
        continue;
      }
      // Try stepping up onto a ledge: lift the box so its bottom sits on top of the blocking row.
      if (canStep && stepUp > 0) {
        const bottom = body.y + body.hh;
        const ny = Math.floor(bottom - 1e-7) - body.hh - EPS;
        if (body.y - ny <= stepUp && !boxBlocked(grid, body, body.x, ny) && !boxBlocked(grid, body, nx, ny)) {
          body.y = ny;
          body.x = nx;
          continue;
        }
      }
      // Snap flush against the blocking column.
      const prevX = body.x;
      if (step > 0) body.x = Math.max(body.x, Math.floor(nx + body.hw) - body.hw - EPS);
      else body.x = Math.min(body.x, Math.floor(nx - body.hw) + 1 + body.hw + EPS);
      if (boxBlocked(grid, body, body.x, body.y)) body.x = prevX; // never snap into something else
      body.vx = 0;
      res.hitX = true;
      break;
    }
  }

  // --- Y axis
  if (dy !== 0) {
    const n = Math.min(MAX_SUBSTEPS, Math.ceil(Math.abs(dy) / MAX_SUBSTEP));
    const step = dy / n;
    for (let k = 0; k < n; k++) {
      const ny = body.y + step;
      if (!boxBlocked(grid, body, body.x, ny)) {
        body.y = ny;
        continue;
      }
      const prevY = body.y;
      if (step > 0) {
        body.y = Math.max(body.y, Math.floor(ny + body.hh) - body.hh - EPS);
        res.landed = true;
      } else {
        body.y = Math.min(body.y, Math.floor(ny - body.hh) + 1 + body.hh + EPS);
        res.bonked = true;
      }
      if (boxBlocked(grid, body, body.x, body.y)) body.y = prevY;
      body.vy = 0;
      res.hitY = true;
      break;
    }
  }

  body.grounded = boxBlocked(grid, body, body.x, body.y + 0.02);
  return res;
}
