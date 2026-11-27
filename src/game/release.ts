import type { Grid } from '../core/grid';
import { BEH, behaviorOf } from '../core/materialTable';
import type { Rng } from '../core/rng';
import type { Simulation } from '../core/sim';
import type { Body } from './body';
import { TUNING } from '../data/tuning';
import { MATERIALS } from '../data/materials';

/** Release goes into empty cells and displaces gas. */
function open(m: number): boolean {
  const b = behaviorOf[m];
  return b === BEH.empty || b === BEH.gas;
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Burst a payload into the world around (x, y): `perGlyph` cells for each
 * matter glyph, all mixed together so they react at once (`>~^` boils into
 * steam). Cells fill the open space connected to the impact point, nearest
 * first, so a burst never leaks through a wall. Returns the cells placed;
 * fewer than asked means there wasn't room.
 */
export function releaseBurst(
  grid: Grid,
  sim: Simulation,
  x: number,
  y: number,
  payload: readonly number[],
  perGlyph: number,
  rng: Rng,
  /** Leave the cells this body overlaps empty (`@` releasing around the witch). */
  avoid?: Body,
): number {
  const inAvoid = (cx: number, cy: number): boolean =>
    avoid !== undefined && cx + 1 > avoid.x - avoid.hw && cx < avoid.x + avoid.hw && cy + 1 > avoid.y - avoid.hh && cy < avoid.y + avoid.hh;
  const counts = payload.map((m) => (perGlyph === TUNING.burstCellsPerGlyph ? (MATERIALS[m]?.burstCells ?? perGlyph) : perGlyph));
  const total = counts.reduce((s, n) => s + n, 0);
  if (total <= 0) return 0;

  // Start from the impact cell, or the nearest open cell if it's buried.
  let sx = Math.floor(x);
  let sy = Math.floor(y);
  if (!open(grid.get(sx, sy))) {
    let best = Infinity;
    let bx = 0;
    let by = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= best || !grid.inBounds(sx + dx, sy + dy) || !open(grid.get(sx + dx, sy + dy))) continue;
        best = d;
        bx = sx + dx;
        by = sy + dy;
      }
    }
    if (best === Infinity) return 0;
    sx = bx;
    sy = by;
  }

  // Flood the connected open space, a little past what we need, then take the nearest cells.
  const want = Math.min(total * 3, 4096);
  const radius = Math.ceil(Math.sqrt(total)) + 4;
  const seen = new Set<number>();
  const queue: number[] = [sx, sy];
  seen.add(sy * grid.width + sx);
  const found: { x: number; y: number; key: number }[] = [];
  for (let qi = 0; qi < queue.length && found.length < want; qi += 2) {
    const cx = queue[qi] as number;
    const cy = queue[qi + 1] as number;
    const ddx = cx + 0.5 - x;
    const ddy = cy + 0.5 - y;
    const jitter = rng.next() * 1.5;
    if (!inAvoid(cx, cy)) found.push({ x: cx, y: cy, key: ddx * ddx + ddy * ddy + jitter });
    for (const [ox, oy] of NEIGHBORS) {
      const nx = cx + ox;
      const ny = cy + oy;
      if (Math.abs(nx - sx) > radius || Math.abs(ny - sy) > radius) continue;
      if (!grid.inBounds(nx, ny)) continue;
      const k = ny * grid.width + nx;
      if (seen.has(k) || !open(grid.get(nx, ny))) continue;
      seen.add(k);
      queue.push(nx, ny);
    }
  }
  found.sort((a, b) => a.key - b.key);

  // Interleave the materials, shuffled, so every glyph touches the others.
  const cells: number[] = [];
  payload.forEach((m, k) => {
    for (let n = 0; n < (counts[k] as number); n++) cells.push(m);
  });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = cells[i] as number;
    cells[i] = cells[j] as number;
    cells[j] = t;
  }
  const n = Math.min(cells.length, found.length);
  for (let i = 0; i < n; i++) {
    const c = found[i]!;
    sim.place(c.x, c.y, cells[i] as number);
  }
  // Released together, they react together: one boosted reaction pass over the burst.
  if (payload.length > 1) {
    for (let i = 0; i < n; i++) sim.reactAt(found[i]!.x, found[i]!.y, TUNING.burstMixChanceScale);
  }
  return n;
}
