import type { Grid } from '../core/grid';

/**
 * True if nothing blocks the straight line between two cells. The endpoints
 * themselves are not tested (you can see the wall you look at, and out of the
 * cell you stand in). Bresenham over cells.
 */
export function lineClear(
  grid: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  blocks: (material: number) => boolean,
): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && blocks(grid.get(x, y))) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
