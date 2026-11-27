import { CREATURE_COST, type BiomeDef } from '../data/biomes';
import { CREATURE_BY_KEY, type CreatureKey } from '../data/creatures';
import { MAT } from '../data/materials';
import { Grid } from './grid';
import type { CellPos, CreatureSpawn, LevelLayout, VentSpec } from './level';
import { BEH, behaviorOf } from './materialTable';
import { canReach, pathTo, reachFrom, type Reach } from './reach';
import { Rng, hash2 } from './rng';

/**
 * The seeded level generator: value noise smoothed by cellular automata for
 * the cave shape, spawn and exit rooms at either end, then material pockets,
 * pools, piles, planks and vents from the biome; a reachability check from
 * spawn to exit (carving a walkable tunnel if it fails); and finally chests
 * off the main path and creatures bought from a difficulty budget.
 * Same seed, biome and depth: same level.
 */

export interface GeneratedLevel extends LevelLayout {
  readonly exit: CellPos;
  /** The walking route from spawn to exit, as cell indices. */
  readonly path: readonly number[];
  /** True if the fallback tunnel had to be carved. */
  readonly carved: boolean;
}

const BORDER = 2;
/** Nothing is placed this close to the spawn or exit (cells). */
const ROOM_CLEARANCE = 9;
/** Creatures start at least this far from the spawn. */
const CREATURE_SPAWN_DISTANCE = 28;
const CREATURE_SPACING = 6;
const CHEST_SPACING = 30;
/** Creatures guarding the main route: this share of picks spawn within ROUTE_GUARD cells of it. */
const ROUTE_GUARD = 8;
const ROUTE_GUARD_SHARE = 0.45;
/** The main route gets a bridge over dips deeper than this (shallower ones you walk down into and hop out of). */
const BRIDGE_DROP = 2;

/** Two octaves of smoothed value noise in 0..1. */
function valueNoise(rng: Rng, w: number, h: number, scale: number): Float32Array {
  const out = new Float32Array(w * h);
  const octave = (s: number, weight: number): void => {
    const gw = Math.ceil(w / s) + 2;
    const gh = Math.ceil(h / s) + 2;
    const lattice = new Float32Array(gw * gh);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
    for (let y = 0; y < h; y++) {
      const fy = y / s;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = x / s;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const a = lattice[y0 * gw + x0] as number;
        const b = lattice[y0 * gw + x0 + 1] as number;
        const c = lattice[(y0 + 1) * gw + x0] as number;
        const d = lattice[(y0 + 1) * gw + x0 + 1] as number;
        const v = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        out[y * w + x] = (out[y * w + x] as number) + v * weight;
      }
    }
  };
  octave(scale, 0.7);
  octave(Math.max(3, scale / 2.7), 0.3);
  return out;
}

/** The cave shape: 1 = rock. */
function caveShape(rng: Rng, biome: BiomeDef, spawn: CellPos, exit: CellPos): { solid: Uint8Array; route: Int16Array } {
  const { width: W, height: H } = biome;
  const noise = valueNoise(rng, W, H, biome.noiseScale);
  let solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const n = (noise[i] as number) + (rng.next() - 0.5) * 0.16;
      solid[i] = x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER || n < biome.solidThreshold ? 1 : 0;
    }
  }
  const route = carveMainRoute(solid, W, H, rng, spawn, exit);
  for (let pass = 0; pass < biome.smoothing; pass++) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER) {
          next[y * W + x] = 1;
          continue;
        }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && solid[(y + dy) * W + x + dx]) n++;
        const i = y * W + x;
        next[i] = n >= 5 ? 1 : n <= 3 ? 0 : (solid[i] as number);
      }
    }
    solid = next;
  }
  return { solid, route };
}

/**
 * The main route: waypoints every 20-36 columns from spawn to exit, each within
 * 10 rows of the last (gentle enough to walk and jump), carved as a chain of
 * discs whose floor follows the line.
 */
function carveMainRoute(solid: Uint8Array, W: number, H: number, rng: Rng, spawn: CellPos, exit: CellPos): Int16Array {
  const route = new Int16Array(W).fill(-1);
  // Level stretches out of the spawn room and into the exit room, so the route meets them at floor height.
  const points: CellPos[] = [spawn, { x: spawn.x + 10, y: spawn.y }];
  for (let x = spawn.x + 10 + rng.intRange(20, 36); x < exit.x - 26; x += rng.intRange(20, 36)) {
    const prev = points[points.length - 1]!;
    points.push({ x, y: Math.max(14, Math.min(H - 12, prev.y + rng.intRange(-10, 10))) });
  }
  points.push({ x: exit.x - 10, y: exit.y }, exit);
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    for (let x = a.x; x <= b.x; x++) {
      const t = (x - a.x) / Math.max(1, b.x - a.x);
      const floor = Math.round(a.y + (b.y - a.y) * t);
      route[x] = floor;
      const r = 3 + (rng.next() < 0.3 ? 1 : 0);
      const cy = floor - r + 1;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = cy + dy;
          if (dx * dx + dy * dy > r * r + 1 || xx < BORDER || yy < BORDER || xx >= W - BORDER || yy >= H - BORDER) continue;
          solid[yy * W + xx] = 0;
        }
      }
    }
  }
  return route;
}

/** Carve a room: open air `w` wide and 4 tall standing on a solid floor at row y+1. */
function carveRoom(solid: Uint8Array, W: number, cx: number, y: number, w: number): void {
  for (let x = cx - (w >> 1); x <= cx + (w >> 1); x++) {
    for (let yy = y - 3; yy <= y; yy++) solid[yy * W + x] = 0;
    solid[(y + 1) * W + x] = 1;
    solid[(y + 2) * W + x] = 1;
  }
}

function isAir(grid: Grid, x: number, y: number): boolean {
  return grid.inBounds(x, y) && grid.get(x, y) === MAT.empty;
}

function isRock(grid: Grid, x: number, y: number): boolean {
  return !grid.inBounds(x, y) || behaviorOf[grid.get(x, y)] === BEH.static;
}

export function generateLevel(seed: number, biome: BiomeDef, depth: number, opts: { carve?: boolean } = {}): GeneratedLevel {
  const rng = new Rng(seed);
  const W = biome.width;
  const H = biome.height;
  // Spawn on the left, exit on the right, joined by a meandering main route carved into the noise
  // before smoothing, so it reads as part of the caves. Side caverns branch off it.
  const spawn = { x: 12, y: Math.floor(H * rng.range(0.3, 0.7)) };
  const exit = { x: W - 13, y: Math.floor(H * rng.range(0.3, 0.7)) };
  const { solid, route } = caveShape(rng, biome, spawn, exit);
  carveRoom(solid, W, spawn.x, spawn.y, 7);
  carveRoom(solid, W, exit.x, exit.y, 7);

  const grid = new Grid(W, H, seed);
  for (let i = 0; i < W * H; i++) if (solid[i]) grid.mat[i] = MAT.rock;
  for (let i = 0; i < W * H; i++) grid.variant[i] = hash2(i % W, (i / W) | 0, seed) & 0xff;

  // Keep the route walkable: clear its head room, and where it crosses a drop deeper than a jump
  // give it a floor (a wooden bridge, so it can burn like any other wood).
  const onRoute = (x: number, y: number): boolean => x >= 0 && x < W && route[x]! >= 0 && y >= route[x]! - 3 && y <= route[x]! + 1;
  for (let x = 0; x < W; x++) {
    const f = route[x] as number;
    if (f < 0) continue;
    for (let y = f - 2; y <= f; y++) grid.mat[y * W + x] = MAT.empty;
    // Only bridge real drops: a dip no deeper than a jump can be walked through.
    let drop = 0;
    while (drop <= BRIDGE_DROP && f + 1 + drop < H && grid.mat[(f + 1 + drop) * W + x] === MAT.empty) drop++;
    if (drop > BRIDGE_DROP) grid.mat[(f + 1) * W + x] = MAT[biome.bridge];
  }

  // An ice crust (Frozen Vaults): rock facing open air frosts over.
  if (biome.crust) {
    const crust = MAT[biome.crust.material];
    for (let y = BORDER; y < H - BORDER; y++) {
      for (let x = BORDER; x < W - BORDER; x++) {
        const i = y * W + x;
        if (grid.mat[i] !== MAT.rock) continue;
        const open = grid.mat[i - 1] === MAT.empty || grid.mat[i + 1] === MAT.empty || grid.mat[i - W] === MAT.empty || grid.mat[i + W] === MAT.empty;
        if (open && rng.next() < biome.crust.chance) grid.mat[i] = crust;
      }
    }
  }

  const nearRooms = (x: number, y: number): boolean =>
    Math.hypot(x - spawn.x, y - spawn.y) < ROOM_CLEARANCE || Math.hypot(x - exit.x, y - exit.y) < ROOM_CLEARANCE;
  const set = (x: number, y: number, m: number): void => {
    if (grid.inBounds(x, y) && x >= BORDER && y >= BORDER && x < W - BORDER && y < H - BORDER) grid.set(x, y, m);
  };
  const randomCell = (): CellPos => ({ x: rng.intRange(BORDER, W - BORDER - 1), y: rng.intRange(BORDER, H - BORDER - 1) });

  // --- Sealed pockets inside rock.
  for (const p of biome.pockets) {
    const m = MAT[p.material];
    for (let n = 0, tries = 0; n < p.count && tries < p.count * 40; tries++) {
      const c = randomCell();
      const r = rng.intRange(p.radius[0], p.radius[1]);
      if (nearRooms(c.x, c.y)) continue;
      let deep = true;
      for (let dy = -r - 1; dy <= r + 1 && deep; dy++) for (let dx = -r - 1; dx <= r + 1 && deep; dx++) if (!isRock(grid, c.x + dx, c.y + dy) || grid.get(c.x + dx, c.y + dy) !== MAT.rock) deep = false;
      if (!deep) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) set(c.x + dx, c.y + dy, m);
      n++;
    }
  }

  // --- Pools filled into floor basins, up to a surface row; leaky or huge basins are skipped.
  for (const p of biome.pools) {
    const m = MAT[p.material];
    for (let n = 0, tries = 0; n < p.count && tries < p.count * 30; tries++) {
      const c = randomCell();
      if (!isAir(grid, c.x, c.y) || !isRock(grid, c.x, c.y + 1) || nearRooms(c.x, c.y)) continue;
      const surface = c.y - rng.int(3);
      const cells: number[] = [];
      const seen = new Set<number>([c.y * W + c.x]);
      const queue = [c.y * W + c.x];
      let ok = true;
      for (let qi = 0; qi < queue.length; qi++) {
        const i = queue[qi] as number;
        const x = i % W;
        const y = (i - x) / W;
        cells.push(i);
        if (cells.length > p.maxCells || nearRooms(x, y)) {
          ok = false;
          break;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          const j = ny * W + nx;
          if (ny < surface || seen.has(j) || !isAir(grid, nx, ny)) continue;
          seen.add(j);
          queue.push(j);
        }
      }
      if (!ok || cells.length < 8) continue;
      for (const i of cells) grid.mat[i] = m;
      n++;
    }
  }

  // --- Powder piles resting on floors (45-degree pyramids, which are stable).
  for (const p of biome.piles) {
    const m = MAT[p.material];
    for (let n = 0, tries = 0; n < p.count && tries < p.count * 30; tries++) {
      const c = randomCell();
      const h = rng.intRange(p.height[0], p.height[1]);
      if (!isAir(grid, c.x, c.y) || nearRooms(c.x, c.y) || onRoute(c.x, c.y)) continue;
      let floor = true;
      for (let dx = -h; dx <= h && floor; dx++) floor = isRock(grid, c.x + dx, c.y + 1);
      if (!floor) continue;
      for (let k = 0; k < h; k++) for (let dx = -(h - 1 - k); dx <= h - 1 - k; dx++) if (isAir(grid, c.x + dx, c.y - k)) set(c.x + dx, c.y - k, m);
      n++;
    }
  }

  // --- Wooden planks across open air (scaffolds, bridges), with posts down to a nearby floor.
  for (let n = 0, tries = 0; n < biome.planks.count && tries < biome.planks.count * 40; tries++) {
    const c = randomCell();
    if (!isAir(grid, c.x, c.y) || nearRooms(c.x, c.y)) continue;
    let x0 = c.x;
    let x1 = c.x;
    const maxLen = biome.planks.length[1];
    while (x0 > BORDER && isAir(grid, x0 - 1, c.y) && x1 - x0 < maxLen) x0--;
    while (x1 < W - BORDER - 1 && isAir(grid, x1 + 1, c.y) && x1 - x0 < maxLen) x1++;
    if (x1 - x0 + 1 < biome.planks.length[0]) continue;
    // Needs head room above so it doesn't seal a passage.
    let clear = true;
    for (let x = x0; x <= x1 && clear; x++) clear = !onRoute(x, c.y) && isAir(grid, x, c.y - 1) && isAir(grid, x, c.y - 2) && isAir(grid, x, c.y - 3);
    if (!clear) continue;
    for (let x = x0; x <= x1; x++) set(x, c.y, MAT.wood);
    for (const px of [x0, x1]) {
      let y = c.y + 1;
      while (y < c.y + 10 && isAir(grid, px, y)) y++;
      let crosses = false;
      for (let yy = c.y + 1; yy < y; yy++) if (onRoute(px, yy)) crosses = true;
      if (y < c.y + 10 && isRock(grid, px, y) && !crosses) for (let yy = c.y + 1; yy < y; yy++) set(px, yy, MAT.wood);
    }
    n++;
  }

  // --- Fire vents: a solid floor strip with open air above for the gate.
  const vents: VentSpec[] = [];
  for (let tries = 0; vents.length < biome.vents && tries < biome.vents * 60; tries++) {
    const c = randomCell();
    const w = rng.intRange(2, 4);
    const h = 4;
    if (nearRooms(c.x, c.y)) continue;
    let ok = true;
    for (let dx = 0; dx < w && ok; dx++) {
      ok = isRock(grid, c.x + dx, c.y) && grid.get(c.x + dx, c.y) === MAT.rock;
      for (let dy = 1; dy <= h && ok; dy++) ok = isAir(grid, c.x + dx, c.y - dy);
    }
    if (!ok) continue;
    vents.push({ x: c.x, y: c.y, w, h });
  }

  // --- The connectivity guarantee: if the exit can't be reached, carve a walkable tunnel to it.
  let reach = reachFrom(grid, spawn.x, spawn.y);
  let carved = false;
  if (opts.carve !== false && !canReach(reach, grid, exit.x, exit.y)) {
    carved = true;
    // First bridge the gap from wherever she can already get closest to the exit...
    const near = nearestReached(reach, exit);
    if (near) {
      carveTunnel(grid, rng, near, exit);
      reach = reachFrom(grid, spawn.x, spawn.y);
    }
    // ...and if that wasn't enough, the whole way from the spawn (always walkable).
    if (!canReach(reach, grid, exit.x, exit.y)) {
      carveTunnel(grid, rng, spawn, exit);
      reach = reachFrom(grid, spawn.x, spawn.y);
    }
  }
  const path = pathTo(reach, exit.x, exit.y);

  const chests = placeChests(grid, rng, reach, path, biome.chests, nearRooms);
  const creatures = placeCreatures(grid, rng, reach, biome, depth, spawn, exit, chests, path);
  return { grid, spawn, exit, chests, creatures, vents, path, carved };
}

/** The reached cell closest to `to`. */
function nearestReached(reach: Reach, to: CellPos): CellPos | null {
  let best: CellPos | null = null;
  let bestD = Infinity;
  for (let i = 0; i < reach.reached.length; i++) {
    if (!reach.reached[i]) continue;
    const x = i % reach.width;
    const y = (i - x) / reach.width;
    const d = (x - to.x) ** 2 + (y - to.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

/**
 * Carve a 4-tall walkable tunnel from `from` to `to` (either direction). The
 * floor climbs at most CLIMB cells per column (a jump), so it is always
 * passable; loose powder and liquid around it is sealed into rock so nothing
 * pours in. Steep ends finish with a straight shaft of jumpable ledges.
 */
function carveTunnel(grid: Grid, rng: Rng, from: CellPos, to: CellPos): void {
  const CLIMB = 3;
  const dir = to.x >= from.x ? 1 : -1;
  let y = from.y;
  let wander = 0;
  const column = (x: number, fy: number): void => {
    for (let yy = fy - 3; yy <= fy; yy++) grid.set(x, yy, MAT.empty);
    if (behaviorOf[grid.get(x, fy + 1)] !== BEH.static) grid.set(x, fy + 1, MAT.rock);
    for (let yy = fy - 7; yy <= fy + 1; yy++) {
      for (let xx = x - 1; xx <= x + 1; xx++) {
        if (yy >= fy - 3 && yy <= fy && xx === x) continue;
        const b = behaviorOf[grid.get(xx, yy)];
        if (grid.inBounds(xx, yy) && (b === BEH.powder || b === BEH.liquid)) grid.set(xx, yy, MAT.rock);
      }
    }
  };
  for (let x = from.x; ; x += dir) {
    if (x !== from.x) {
      const left = Math.abs(to.x - x);
      if (x % 6 === 0) wander = rng.intRange(-1, 1);
      const need = to.y - y;
      let dy: number;
      if (Math.abs(need) >= left * CLIMB) dy = Math.sign(need) * CLIMB;
      else if (Math.abs(need) >= left) dy = Math.sign(need);
      else if (Math.abs(need) < left - 4) dy = wander;
      else dy = Math.sign(need);
      y = Math.max(BORDER + 4, Math.min(grid.height - BORDER - 3, y + dy));
    }
    column(x, y);
    if (x === to.x) break;
  }
  // Still off in height (a steep finish): a shaft with ledges every 3 rows, then the exit cell.
  const step = Math.sign(to.y - y);
  let k = 0;
  while (y !== to.y) {
    y += step;
    for (let yy = y - 3; yy <= y; yy++) grid.set(to.x, yy, MAT.empty);
    for (let yy = y - 3; yy <= y; yy++) grid.set(to.x + dir, yy, MAT.empty);
    if (step < 0 && ++k % 3 === 0) grid.set(to.x - dir, y + 1, MAT.rock);
  }
  column(to.x, to.y);
}

function placeChests(
  grid: Grid,
  rng: Rng,
  reach: Reach,
  path: readonly number[],
  count: number,
  nearRooms: (x: number, y: number) => boolean,
): CellPos[] {
  const W = grid.width;
  const pathPts = path.filter((_, k) => k % 3 === 0).map((i) => ({ x: i % W, y: Math.floor(i / W) }));
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let i = 0; i < reach.reached.length; i++) {
    if (!reach.reached[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (nearRooms(x, y) || grid.get(x, y) !== MAT.empty || !isRock(grid, x, y + 1)) continue;
    if ((hash2(x, y, 77) & 7) !== 0) continue; // sample, for speed
    let d = Infinity;
    for (const p of pathPts) d = Math.min(d, Math.abs(p.x - x) + Math.abs(p.y - y));
    candidates.push({ x, y, d });
  }
  // Prefer spots well off the main route.
  candidates.sort((a, b) => b.d - a.d);
  const pool = candidates.slice(0, Math.max(count * 8, 1));
  const out: CellPos[] = [];
  while (out.length < count && pool.length > 0) {
    const c = pool.splice(rng.int(pool.length), 1)[0]!;
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < CHEST_SPACING)) continue;
    out.push({ x: c.x, y: c.y });
  }
  return out;
}

function placeCreatures(
  grid: Grid,
  rng: Rng,
  reach: Reach,
  biome: BiomeDef,
  depth: number,
  spawn: CellPos,
  exit: CellPos,
  chests: readonly CellPos[],
  path: readonly number[],
): CreatureSpawn[] {
  const W = grid.width;
  const ground: CellPos[] = [];
  const air: CellPos[] = [];
  // Cells near the main route: part of the budget guards it, so rushing through isn't free.
  const nearRoute = new Uint8Array(W * grid.height);
  for (let k = 0; k < path.length; k += 2) {
    const px = (path[k] as number) % W;
    const py = Math.floor((path[k] as number) / W);
    for (let y = Math.max(0, py - ROUTE_GUARD); y <= Math.min(grid.height - 1, py + ROUTE_GUARD); y++) {
      for (let x = Math.max(0, px - ROUTE_GUARD); x <= Math.min(W - 1, px + ROUTE_GUARD); x++) nearRoute[y * W + x] = 1;
    }
  }
  for (let i = 0; i < reach.reached.length; i++) {
    if (!reach.reached[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (Math.hypot(x - spawn.x, y - spawn.y) < CREATURE_SPAWN_DISTANCE || Math.hypot(x - exit.x, y - exit.y) < 6) continue;
    if (grid.get(x, y) !== MAT.empty) continue;
    if (isRock(grid, x, y + 1)) ground.push({ x, y });
    // Fliers start a few cells up in open air above reachable ground.
    const fy = y - 3;
    if (Math.hypot(x - spawn.x, fy - spawn.y) >= CREATURE_SPAWN_DISTANCE && isAir(grid, x, fy) && isAir(grid, x, fy - 1) && isAir(grid, x - 1, fy) && isAir(grid, x + 1, fy)) air.push({ x, y: fy });
  }

  const groundNear = ground.filter((c) => nearRoute[c.y * W + c.x]);
  const airNear = air.filter((c) => nearRoute[c.y * W + c.x]);
  const picks = Object.entries(biome.creatures) as [CreatureKey, number][];
  const total = picks.reduce((s, [, w]) => s + w, 0);
  let budget = biome.budget.base + biome.budget.perDepth * (depth - 1);
  const out: CreatureSpawn[] = [];
  const taken = (p: CellPos): boolean =>
    out.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < CREATURE_SPACING) || chests.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 3);
  for (let tries = 0; budget > 0 && tries < 400; tries++) {
    let r = rng.next() * total;
    let key = picks[0]![0];
    for (const [k, w] of picks) {
      r -= w;
      if (r <= 0) {
        key = k;
        break;
      }
    }
    const cost = CREATURE_COST[key];
    if (cost > budget) {
      if (!picks.some(([k]) => CREATURE_COST[k] <= budget)) break;
      continue;
    }
    const loco = CREATURE_BY_KEY.get(key)!.locomotion;
    const all = loco === 'flyer' || loco === 'hover' ? air : ground;
    const guards = loco === 'flyer' || loco === 'hover' ? airNear : groundNear;
    const list = guards.length > 0 && rng.next() < ROUTE_GUARD_SHARE ? guards : all;
    if (list.length === 0) continue;
    const p = list[rng.int(list.length)]!;
    if (taken(p)) continue;
    out.push({ key, x: p.x, y: p.y });
    budget -= cost;
  }
  return out;
}
