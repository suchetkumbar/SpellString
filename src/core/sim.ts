import { Grid } from './grid';
import { Rng, hash2 } from './rng';
import {
  BEH,
  CONTACTS,
  DECAYS,
  MAX_MATERIALS,
  behaviorOf,
  contactDirMask,
  contactGlobal,
  contactIndex,
  decayGlobal,
  decayOf,
  densityOf,
  dispersionOf,
  hasContact,
  lifeMaxOf,
  lifeMinOf,
  matId,
} from './materialTable';
import { REACTIONS } from '../data/reactions';
import { TUNING } from '../data/tuning';

const UPDATED = 1;
const EMPTY = 0;
const FIRE = matId('fire');

// 4-neighborhood offsets: up, right, down, left.
const NX = [0, 1, 0, -1] as const;
const NY = [-1, 0, 1, 0] as const;

/**
 * The falling-sand world simulation. Deterministic: all randomness comes from
 * its seeded Rng. Only chunks that changed recently are updated.
 *
 * Each tick runs two passes:
 *  1. bottom-to-top: powders, liquids, fire and reactive statics;
 *  2. top-to-bottom: gases.
 * The horizontal scan direction alternates every tick so nothing drifts sideways.
 */
export class Simulation {
  readonly rng: Rng;
  tick = 0;

  readonly chunkShift: number;
  readonly chunkSize: number;
  readonly chunksX: number;
  readonly chunksY: number;
  /** Ticks until each chunk sleeps (0 = asleep). */
  readonly chunkTimer: Uint8Array;
  /** Chunks processed in the current/last tick. */
  readonly chunkActive: Uint8Array;
  /**
   * Chunks whose cell contents changed since a consumer (the renderer) last
   * cleared the flag. The simulation only ever sets these.
   */
  readonly chunkDirty: Uint8Array;
  /** How many times each reaction (indexed like REACTIONS) has fired. */
  readonly reactionCounts: Uint32Array;
  /** Called the first time a reaction fires in this simulation (hook for the Codex). */
  onReaction: ((reactionIndex: number, x: number, y: number) => void) | null = null;

  private readonly visit: Uint32Array;
  private visitStamp = 0;
  private readonly queue: Int32Array;

  constructor(
    readonly grid: Grid,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.chunkShift = TUNING.chunkShift;
    this.chunkSize = 1 << this.chunkShift;
    this.chunksX = Math.ceil(grid.width / this.chunkSize);
    this.chunksY = Math.ceil(grid.height / this.chunkSize);
    this.chunkTimer = new Uint8Array(this.chunksX * this.chunksY);
    this.chunkActive = new Uint8Array(this.chunksX * this.chunksY);
    this.chunkDirty = new Uint8Array(this.chunksX * this.chunksY).fill(1);
    this.reactionCounts = new Uint32Array(REACTIONS.length);
    this.visit = new Uint32Array(grid.width * grid.height);
    this.queue = new Int32Array(TUNING.liquidLevelSearchCap + 8);
    this.wakeAll();
  }

  // ---------------------------------------------------------------- public API

  /** Number of chunks updated in the last tick. */
  get activeChunkCount(): number {
    let n = 0;
    for (let i = 0; i < this.chunkActive.length; i++) n += this.chunkActive[i] as number;
    return n;
  }

  wakeAll(): void {
    this.chunkTimer.fill(TUNING.chunkSleepTicks);
  }

  /** Wake the chunks around a cell (call after editing the grid from outside). */
  wake(x: number, y: number): void {
    const s = this.chunkShift;
    const mask = this.chunkSize - 1;
    const lx = x & mask;
    const ly = y & mask;
    if (lx > 0 && lx < mask && ly > 0 && ly < mask) {
      // Fast path: not on a chunk border, so only this chunk is affected.
      this.chunkTimer[(y >> s) * this.chunksX + (x >> s)] = TUNING.chunkSleepTicks;
      return;
    }
    const cx0 = Math.max(0, (x - 1) >> s);
    const cx1 = Math.min(this.chunksX - 1, (x + 1) >> s);
    const cy0 = Math.max(0, (y - 1) >> s);
    const cy1 = Math.min(this.chunksY - 1, (y + 1) >> s);
    const k = TUNING.chunkSleepTicks;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) this.chunkTimer[cy * this.chunksX + cx] = k;
    }
  }

  /** Place a material (lifetime is assigned on its first update). */
  place(x: number, y: number, material: number): void {
    if (!this.grid.inBounds(x, y)) return;
    this.grid.set(x, y, material);
    this.wake(x, y);
    this.markDirty(x, y);
  }

  /** Flag the chunk holding (x, y) as visually changed. */
  markDirty(x: number, y: number): void {
    this.chunkDirty[(y >> this.chunkShift) * this.chunksX + (x >> this.chunkShift)] = 1;
  }

  /**
   * Something burning (a creature, the witch) touches cell (x, y): apply the
   * cell's fire contact reaction (fire + X) as if a fire cell were there, with
   * its chance scaled. Returns true if the cell changed.
   */
  exposeToFire(x: number, y: number, chanceScale: number): boolean {
    const g = this.grid;
    if (!g.inBounds(x, y)) return false;
    const i = g.index(x, y);
    const m = g.mat[i] as number;
    if (m >= MAX_MATERIALS) return false;
    const r = contactIndex[FIRE * MAX_MATERIALS + m] as number;
    if (r < 0) return false;
    const R = CONTACTS[r]!;
    if (R.bTo === undefined || this.rng.next() >= R.chance * chanceScale) return false;
    this.setCell(i, x, y, matId(R.bTo), R.bLife);
    this.count(contactGlobal[r]!, x, y);
    return true;
  }

  /** Clear the whole grid to empty. */
  clear(): void {
    this.grid.mat.fill(EMPTY);
    this.grid.life.fill(0);
    this.wakeAll();
    this.chunkDirty.fill(1);
  }

  step(): void {
    this.tick++;
    const g = this.grid;
    const W = g.width;
    const H = g.height;
    const s = this.chunkShift;
    const cs = this.chunkSize;
    const flags = g.flags;

    // Snapshot which chunks run this tick, then age their timers.
    for (let c = 0; c < this.chunkTimer.length; c++) {
      const t = this.chunkTimer[c] as number;
      if (t > 0) {
        this.chunkActive[c] = 1;
        this.chunkTimer[c] = t - 1;
      } else {
        this.chunkActive[c] = 0;
      }
    }
    // Clear updated flags inside active chunks.
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        if (!this.chunkActive[cy * this.chunksX + cx]) continue;
        const x0 = cx << s;
        const x1 = Math.min(W, x0 + cs);
        const y1 = Math.min(H, (cy << s) + cs);
        for (let y = cy << s; y < y1; y++) flags.fill(0, y * W + x0, y * W + x1);
      }
    }

    const leftToRight = (this.tick & 1) === 0;

    // Pass 1: bottom to top (falling things).
    for (let y = H - 1; y >= 0; y--) this.sweepRow(y, leftToRight, false);
    // Pass 2: top to bottom (rising gases).
    for (let y = 0; y < H; y++) this.sweepRow(y, leftToRight, true);
  }

  /** Update one row, visiting only the x-spans of active chunks, in the given direction. */
  private sweepRow(y: number, leftToRight: boolean, gasPass: boolean): void {
    const W = this.grid.width;
    const s = this.chunkShift;
    const cs = this.chunkSize;
    const nCx = this.chunksX;
    const rowChunk = (y >> s) * nCx;
    const active = this.chunkActive;
    for (let c = 0; c < nCx; c++) {
      const cx = leftToRight ? c : nCx - 1 - c;
      if (!active[rowChunk + cx]) continue;
      const x0 = cx << s;
      const x1 = Math.min(W, x0 + cs);
      if (leftToRight) {
        for (let x = x0; x < x1; x++) this.updateCell(x, y, gasPass);
      } else {
        for (let x = x1 - 1; x >= x0; x--) this.updateCell(x, y, gasPass);
      }
    }
  }

  private updateCell(x: number, y: number, gasPass: boolean): void {
    const g = this.grid;
    const i = y * g.width + x;
    if ((g.flags[i] as number) & UPDATED) return;
    const m = g.mat[i] as number;
    if (m === EMPTY) return;
    const b = behaviorOf[m];
    if (gasPass) {
      if (b === BEH.gas) this.updateGas(x, y, i, m);
      return;
    }
    switch (b) {
      case BEH.powder:
        this.updatePowder(x, y, i, m);
        break;
      case BEH.liquid:
        this.updateLiquid(x, y, i, m);
        break;
      case BEH.fire:
        this.updateFire(x, y, i, m);
        break;
      case BEH.static:
        if (hasContact[m]) this.react(x, y, i, m);
        break;
    }
  }

  // ---------------------------------------------------------------- behaviors

  private updatePowder(x: number, y: number, i: number, m: number): void {
    if (this.tryFall(x, y, i, m, x, y + 1, true)) return;
    const d = this.rng.next() < 0.5 ? -1 : 1;
    if (this.tryFall(x, y, i, m, x + d, y + 1, true)) return;
    if (this.tryFall(x, y, i, m, x - d, y + 1, true)) return;
    if (hasContact[m]) this.react(x, y, i, m);
  }

  private updateLiquid(x: number, y: number, i: number, m: number): void {
    if (hasContact[m] && this.react(x, y, i, m)) return;
    if (this.tryFall(x, y, i, m, x, y + 1, false)) return;
    const d = this.rng.next() < 0.5 ? -1 : 1;
    if (this.tryFall(x, y, i, m, x + d, y + 1, false)) return;
    if (this.tryFall(x, y, i, m, x - d, y + 1, false)) return;
    const disp = dispersionOf[m] as number;
    if (this.flow(x, y, i, d, disp)) return;
    if (this.flow(x, y, i, -d, disp)) return;
    // Blocked. If this is a surface cell, try to level the body (U-tube behavior).
    const above = this.grid.get(x, y - 1);
    // Fixed, staggered cadence (not a random chance) so every surface cell is
    // guaranteed attempts before its chunk can fall asleep.
    if ((above === EMPTY || behaviorOf[above] === BEH.gas) && (this.tick + x * 5 + y * 3) % TUNING.liquidLevelEvery === 0) {
      this.level(x, y, i, m);
    }
  }

  private updateFire(x: number, y: number, i: number, m: number): void {
    if (this.react(x, y, i, m)) return;
    this.age(x, y, i, m);
  }

  private updateGas(x: number, y: number, i: number, m: number): void {
    if (hasContact[m] && this.react(x, y, i, m)) return;
    if (this.age(x, y, i, m)) return;
    const rng = this.rng;
    const d = rng.next() < 0.5 ? -1 : 1;
    if (rng.next() < TUNING.gasDriftChance) {
      if (this.tryRise(x, y, i, m, x + d, y - 1)) return;
      if (this.tryRise(x, y, i, m, x, y - 1)) return;
    } else {
      if (this.tryRise(x, y, i, m, x, y - 1)) return;
      if (this.tryRise(x, y, i, m, x + d, y - 1)) return;
    }
    if (this.tryRise(x, y, i, m, x - d, y - 1)) return;
    // Pressed against a ceiling: wander sideways into open air.
    if (this.grid.get(x + d, y) === EMPTY) this.moveTo(i, x + d, y, x, y);
  }

  // ---------------------------------------------------------------- movement

  /** Powder/liquid moving down or diagonally down into (tx, ty). */
  private tryFall(x: number, y: number, i: number, m: number, tx: number, ty: number, powder: boolean): boolean {
    const t = this.grid.get(tx, ty);
    if (t === EMPTY || behaviorOf[t] === BEH.gas) {
      this.moveTo(i, tx, ty, x, y);
      return true;
    }
    if (behaviorOf[t] === BEH.liquid && (densityOf[m] as number) > (densityOf[t] as number)) {
      if (powder && this.rng.next() >= TUNING.powderSinkChance) return false;
      this.moveTo(i, tx, ty, x, y);
      return true;
    }
    return false;
  }

  /** Gas moving up or diagonally up into (tx, ty). */
  private tryRise(x: number, y: number, i: number, m: number, tx: number, ty: number): boolean {
    const t = this.grid.get(tx, ty);
    if (t === EMPTY) {
      this.moveTo(i, tx, ty, x, y);
      return true;
    }
    const bt = behaviorOf[t];
    if (bt === BEH.liquid) {
      if (this.rng.next() >= TUNING.gasBubbleChance) return false;
    } else if (bt === BEH.gas && t !== m && (densityOf[m] as number) < (densityOf[t] as number)) {
      if (this.rng.next() >= TUNING.gasSwapChance) return false;
    } else {
      return false;
    }
    this.moveTo(i, tx, ty, x, y);
    return true;
  }

  /**
   * Liquid flowing sideways: scan up to `disp` cells through empty/gas and move
   * to the first one that has a drop beneath it. Flowing only toward a drop
   * lets puddles settle (and their chunks sleep) instead of jittering forever;
   * `level()` handles evening out connected bodies.
   */
  private flow(x: number, y: number, i: number, dir: number, disp: number): boolean {
    for (let k = 1; k <= disp; k++) {
      const tx = x + dir * k;
      const t = this.grid.get(tx, y);
      if (t !== EMPTY && behaviorOf[t] !== BEH.gas) return false;
      const below = this.grid.get(tx, y + 1);
      if (below === EMPTY || behaviorOf[below] === BEH.gas) {
        this.moveTo(i, tx, y, x, y);
        return true;
      }
    }
    return false;
  }

  /**
   * Communicating vessels: search the connected body of this liquid for an
   * empty cell touching it that sits strictly lower than this surface cell,
   * and move this cell there. Strictly lower means total height always drops,
   * so it can't oscillate.
   */
  private level(x: number, y: number, i: number, m: number): void {
    const g = this.grid;
    const W = g.width;
    const H = g.height;
    const mat = g.mat;
    const visit = this.visit;
    const queue = this.queue;
    const cap = TUNING.liquidLevelSearchCap;
    const stamp = ++this.visitStamp;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visit[i] = stamp;
    // BFS order finds the nearest strictly-lower spot first; take it and stop.
    let best = -1;
    let bestY = y;
    search: while (head < tail) {
      const v = queue[head++] as number;
      const vx = v % W;
      const vy = (v - vx) / W;
      for (let n = 0; n < 4; n++) {
        const nx = vx + NX[n]!;
        const ny = vy + NY[n]!;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (visit[j] === stamp) continue;
        visit[j] = stamp;
        const nm = mat[j] as number;
        if (nm === m) {
          if (tail < cap) queue[tail++] = j;
        } else if (nm === EMPTY && ny > y) {
          best = j;
          bestY = ny;
          break search;
        }
      }
    }
    if (best < 0) return;
    const bx = best % W;
    this.moveTo(i, bx, bestY, x, y);
  }

  /** Swap cell i (at x, y) with (tx, ty). Both cells are marked updated. */
  private moveTo(i: number, tx: number, ty: number, x: number, y: number): void {
    const g = this.grid;
    const j = ty * g.width + tx;
    const mat = g.mat;
    const life = g.life;
    const variant = g.variant;
    const m = mat[i] as number;
    mat[i] = mat[j] as number;
    mat[j] = m;
    const l = life[i] as number;
    life[i] = life[j] as number;
    life[j] = l;
    const v = variant[i] as number;
    variant[i] = variant[j] as number;
    variant[j] = v;
    g.flags[i]! |= UPDATED;
    g.flags[j]! |= UPDATED;
    this.wake(x, y);
    this.wake(tx, ty);
    this.markDirty(x, y);
    this.markDirty(tx, ty);
  }

  // ---------------------------------------------------------------- chemistry

  /**
   * Check contact reactions from cell i (material m, as reaction side `a`)
   * against its 4 neighbors. Returns true if cell i itself changed.
   */
  private react(x: number, y: number, i: number, m: number): boolean {
    const g = this.grid;
    const W = g.width;
    const rng = this.rng;
    const start = rng.int(4);
    const row = m * MAX_MATERIALS;
    for (let k = 0; k < 4; k++) {
      const n = (start + k) & 3;
      const nx = x + NX[n]!;
      const ny = y + NY[n]!;
      if (!g.inBounds(nx, ny)) continue;
      const j = ny * W + nx;
      const nm = g.mat[j] as number;
      if (nm >= MAX_MATERIALS) continue;
      const r = contactIndex[row + nm] as number;
      if (r < 0 || !((contactDirMask[r] as number) & (1 << n))) continue;
      const R = CONTACTS[r]!;
      if (rng.next() >= R.chance) continue;
      if (R.bTo !== undefined) this.setCell(j, nx, ny, matId(R.bTo), R.bLife);
      this.count(contactGlobal[r]!, nx, ny);
      if (R.aTo !== undefined) {
        this.setCell(i, x, y, matId(R.aTo), R.aLife);
        return true;
      }
    }
    return false;
  }

  /** Lifetime tick for fire and gases. Returns true if the cell decayed. */
  private age(x: number, y: number, i: number, m: number): boolean {
    const g = this.grid;
    let l = g.life[i] as number;
    if (l === 0) l = this.rng.intRange(lifeMinOf[m] as number, lifeMaxOf[m] as number);
    l--;
    this.wake(x, y);
    if (l > 0) {
      g.life[i] = l;
      return false;
    }
    const d = decayOf[m] as number;
    if (d < 0) {
      g.life[i] = 1;
      return false;
    }
    const D = DECAYS[d]!;
    let total = 0;
    for (const o of D.outcomes) total += o.weight;
    let roll = this.rng.next() * total;
    let to = D.outcomes[D.outcomes.length - 1]!.to;
    for (const o of D.outcomes) {
      roll -= o.weight;
      if (roll < 0) {
        to = o.to;
        break;
      }
    }
    this.setCell(i, x, y, matId(to), undefined);
    this.count(decayGlobal[d]!, x, y);
    return true;
  }

  private setCell(i: number, x: number, y: number, m: number, life: readonly [number, number] | undefined): void {
    const g = this.grid;
    g.mat[i] = m;
    g.life[i] = life ? this.rng.intRange(life[0], life[1]) : 0;
    g.variant[i] = hash2(x, y, g.variantSeed ^ this.tick) & 0xff;
    g.flags[i]! |= UPDATED;
    this.wake(x, y);
    this.markDirty(x, y);
  }

  private count(reactionIndex: number, x: number, y: number): void {
    const c = this.reactionCounts[reactionIndex] as number;
    this.reactionCounts[reactionIndex] = c + 1;
    if (c === 0 && this.onReaction) this.onReaction(reactionIndex, x, y);
  }
}

