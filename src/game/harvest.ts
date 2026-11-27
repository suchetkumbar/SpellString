import type { Grid } from '../core/grid';
import { BEH, MAX_MATERIALS, behaviorOf } from '../core/materialTable';
import type { Rng } from '../core/rng';
import type { Simulation } from '../core/sim';
import { MAT, MATERIALS } from '../data/materials';
import { TUNING } from '../data/tuning';
import { isSolid } from './body';
import type { TickInput } from './input';
import { lineClear } from './los';
import type { Player } from './player';

const DT = 1 / TUNING.simHz;

/** One charge count per material, each capped. Charges in flight count toward the cap. */
export class Pouch {
  readonly counts = new Uint16Array(MAX_MATERIALS);
  readonly inFlight = new Uint16Array(MAX_MATERIALS);
  /** 1 once a material has ever had a charge: its glyph is owned for spells. */
  readonly seen = new Uint8Array(MAX_MATERIALS);

  constructor(readonly cap: number = TUNING.pouchCap) {}

  /** Cap for one material: the wallet (gold) holds far more than a pouch slot. */
  capOf(material: number): number {
    return MATERIALS[material]?.currency ? TUNING.walletCap : this.cap;
  }

  count(material: number): number {
    return this.counts[material] ?? 0;
  }

  /** Room for one more (including charges still flying in). */
  hasRoom(material: number): boolean {
    return (this.counts[material] as number) + (this.inFlight[material] as number) < this.capOf(material);
  }

  add(material: number, n = 1): void {
    if (n > 0) this.seen[material] = 1;
    this.counts[material] = Math.min(this.capOf(material), (this.counts[material] as number) + n);
  }

  /** Spend one charge. Returns false (a fizzle) if there is none. */
  spend(material: number): boolean {
    const c = this.counts[material] as number;
    if (c <= 0) return false;
    this.counts[material] = c - 1;
    return true;
  }
}

/** A harvested glyph flying to the witch. It becomes a charge when it arrives. */
export interface GlyphParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  readonly material: number;
  age: number;
}

/** Persistent harvesting state (between ticks). */
export class Harvester {
  /** Material being harvested, locked while the button stays held. */
  material = 0;
  /** Fractional cells owed (harvest rates are cells/second). */
  private acc = 0;
  active = false;
  /** The pouch is full for the current material. */
  full = false;
  /** Center of the harvest area (cells), for drawing the ring. */
  centerX = 0;
  centerY = 0;
  readonly particles: GlyphParticle[] = [];

  update(input: TickInput, player: Player, grid: Grid, sim: Simulation, pouch: Pouch, rng: Rng): void {
    this.updateParticles(player, pouch);
    this.active = input.harvest && !player.dead;
    this.full = false;
    if (!this.active) {
      this.material = 0;
      this.acc = 0;
      return;
    }

    // Center of the harvest area: the cursor, pulled back to within reach.
    let cx = input.aimX;
    let cy = input.aimY;
    const dx = cx - player.x;
    const dy = cy - player.y;
    const dist = Math.hypot(dx, dy);
    const range = TUNING.harvestRange;
    if (dist > range) {
      cx = player.x + (dx / dist) * range;
      cy = player.y + (dy / dist) * range;
    }
    this.centerX = cx;
    this.centerY = cy;

    // Lock onto the material under the cursor; keep it while that cell drains.
    const under = grid.get(Math.floor(cx), Math.floor(cy));
    if (under < MAX_MATERIALS && (MATERIALS[under]?.harvestRate ?? 0) > 0) this.material = under;
    const m = this.material;
    if (m === 0) return;
    if (!pouch.hasRoom(m)) {
      this.full = true;
      this.acc = 0;
      return;
    }

    this.acc += (MATERIALS[m]?.harvestRate ?? 0) * DT;
    while (this.acc >= 1) {
      if (!pouch.hasRoom(m)) {
        this.full = true;
        this.acc = 0;
        break;
      }
      const cell = this.pick(grid, player, cx, cy, m);
      if (!cell) {
        this.acc = Math.min(this.acc, 1);
        break;
      }
      this.acc -= 1;
      sim.place(cell.x, cell.y, MAT.empty);
      pouch.inFlight[m] = (pouch.inFlight[m] as number) + 1;
      const px = cell.x + 0.5;
      const py = cell.y + 0.5;
      // A little sideways kick so a stream of glyphs fans out before homing in.
      const a = rng.range(0, Math.PI * 2);
      const kick = rng.range(2, 6);
      this.particles.push({
        x: px,
        y: py,
        prevX: px,
        prevY: py,
        vx: Math.cos(a) * kick,
        vy: Math.sin(a) * kick,
        material: m,
        age: 0,
      });
    }
  }

  /**
   * Choose the next cell to pull. Loose matter comes off the top (a pool drains
   * like drinking); solids are dug from the side nearest the witch. The witch
   * must have line of sight to the cell.
   */
  private pick(grid: Grid, player: Player, cx: number, cy: number, m: number): { x: number; y: number } | null {
    const r = TUNING.harvestRadius;
    const range = TUNING.harvestRange + 0.5;
    const pcx = Math.floor(player.x);
    const pcy = Math.floor(player.y);
    const solid = behaviorOf[m] === BEH.static;
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++) {
        if (grid.get(x, y) !== m) continue;
        const ccx = x + 0.5;
        const ccy = y + 0.5;
        const dc = Math.hypot(ccx - cx, ccy - cy);
        if (dc > r) continue;
        const dp = Math.hypot(ccx - player.x, ccy - player.y);
        if (dp > range) continue;
        const score = solid ? dp : y * 1000 + dc;
        if (score >= bestScore) continue;
        if (!lineClear(grid, pcx, pcy, x, y, isSolid)) continue;
        best = { x, y };
        bestScore = score;
      }
    }
    return best;
  }

  private updateParticles(player: Player, pouch: Pouch): void {
    const accel = TUNING.harvestParticleAccel * DT;
    const keep = 1 - TUNING.harvestParticleDrag;
    let w = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      p.prevX = p.x;
      p.prevY = p.y;
      p.age++;
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.6 || p.age > TUNING.harvestParticleMaxTicks || player.dead) {
        pouch.inFlight[p.material] = Math.max(0, (pouch.inFlight[p.material] as number) - 1);
        if (!player.dead) pouch.add(p.material);
        continue;
      }
      p.vx = (p.vx + (dx / d) * accel) * keep;
      p.vy = (p.vy + (dy / d) * accel) * keep;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      this.particles[w++] = p;
    }
    this.particles.length = w;
  }
}
