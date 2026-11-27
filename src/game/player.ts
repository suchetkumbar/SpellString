import type { Grid } from '../core/grid';
import { BEH, behaviorOf } from '../core/materialTable';
import type { Simulation } from '../core/sim';
import { MAT, MATERIALS } from '../data/materials';
import { TUNING } from '../data/tuning';
import { forEachOverlap, moveBody, refreshBuried, type Body } from './body';
import type { TickInput } from './input';

/** What hurt the witch, for the HUD and the death screen ("killed by: ^ (burning)"). */
export interface DamageSource {
  readonly glyph: string;
  readonly text: string;
}

const DT = 1 / TUNING.simHz;

function source(materialId: number, text: string): DamageSource {
  return { glyph: MATERIALS[materialId]?.glyph ?? '?', text };
}

export const DAMAGE = {
  fire: source(MAT.fire, 'fire'),
  burning: source(MAT.fire, 'burning'),
  steam: source(MAT.steam, 'scalding steam'),
  buried: source(MAT.sand, 'buried alive'),
} as const;

export class Player {
  readonly body: Body;
  /** Position at the previous tick, for render interpolation. */
  prevX: number;
  prevY: number;

  hp: number = TUNING.playerMaxHp;
  readonly maxHp: number = TUNING.playerMaxHp;

  /** Ticks of burning left (0 = not burning). */
  burning = 0;
  /** Ticks of the scalded status left (display + damage while in steam). */
  scalded = 0;
  /** Overlapping any powder this tick. */
  buried = false;
  /** Consecutive ticks with powder over the head. */
  smothered = 0;
  /** Center is inside a liquid. */
  swimming = false;
  facing: 1 | -1 = 1;

  dead = false;
  killedBy: DamageSource | null = null;
  /** Damage taken this tick (for HUD flashes / numbers). */
  hurtThisTick = 0;

  /** Ticks since last standing on ground (coyote time). */
  private airTicks = 1_000_000;
  private jumpBuffer = 0;
  private jumping = false;

  constructor(x: number, y: number) {
    this.body = {
      x,
      y,
      vx: 0,
      vy: 0,
      hw: TUNING.playerHalfWidth,
      hh: TUNING.playerHalfHeight,
      grounded: false,
      ignore: [],
    };
    this.prevX = x;
    this.prevY = y;
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  damage(amount: number, from: DamageSource): void {
    if (this.dead || amount <= 0) return;
    this.hp -= amount;
    this.hurtThisTick += amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killedBy = from;
      this.body.vx = 0;
    }
  }

  /** One fixed tick of movement and statuses. */
  update(input: TickInput, grid: Grid, sim: Simulation): void {
    const b = this.body;
    this.prevX = b.x;
    this.prevY = b.y;
    this.hurtThisTick = 0;
    if (this.dead) return;

    this.buried = refreshBuried(grid, b) > 0;
    const center = grid.get(Math.floor(b.x), Math.floor(b.y));
    this.swimming = behaviorOf[center] === BEH.liquid;
    const headM = grid.get(Math.floor(b.x), Math.floor(b.y - b.hh + 0.1));
    const headInLiquid = behaviorOf[headM] === BEH.liquid;
    // Standing in a puddle no deeper than she is tall: she can still jump off the bottom.
    const shallow = b.grounded && behaviorOf[grid.get(Math.floor(b.x), Math.floor(b.y - b.hh) - 1)] !== BEH.liquid;
    const slow = this.buried ? TUNING.buriedSlow : 1;

    // --- Horizontal
    const moveX = Math.sign(input.moveX);
    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
    const maxRun = TUNING.walkSpeed * slow * (this.swimming ? TUNING.swimHorizontal : 1);
    const accel = (b.grounded ? TUNING.groundAccel : TUNING.airAccel) * DT;
    b.vx = approach(b.vx, moveX * maxRun, accel);

    // --- Jump bookkeeping
    this.airTicks = b.grounded ? 0 : this.airTicks + 1;
    this.jumpBuffer = input.jumpPressed ? TUNING.jumpBufferTicks : Math.max(0, this.jumpBuffer - 1);

    // --- Vertical
    if (this.swimming) {
      this.jumping = false;
      if (this.jumpBuffer > 0 && (!headInLiquid || shallow)) {
        // Leap out at the surface (or off the bottom of a shallow puddle).
        b.vy = -TUNING.jumpSpeed * TUNING.swimLeap * slow;
        this.jumpBuffer = 0;
      } else if (input.jumpHeld) {
        b.vy = approach(b.vy, -TUNING.swimSpeed, TUNING.swimAccel * DT);
      } else if (input.moveY > 0) {
        b.vy = approach(b.vy, TUNING.swimSpeed, TUNING.swimAccel * DT);
      } else {
        b.vy = Math.min(b.vy + TUNING.gravity * TUNING.swimGravityScale * DT, TUNING.swimSinkSpeed);
        if (b.vy < -TUNING.swimSpeed) b.vy = approach(b.vy, -TUNING.swimSpeed, TUNING.swimAccel * DT);
      }
    } else {
      if (this.jumpBuffer > 0 && this.airTicks <= TUNING.coyoteTicks) {
        b.vy = -TUNING.jumpSpeed * (this.buried ? 0.6 : 1);
        this.jumpBuffer = 0;
        this.airTicks = 1_000_000;
        this.jumping = true;
      }
      if (this.jumping && !input.jumpHeld && b.vy < 0) {
        b.vy *= TUNING.jumpCut; // variable jump height
        this.jumping = false;
      }
      if (b.vy >= 0) this.jumping = false;
      b.vy = Math.min(b.vy + TUNING.gravity * DT, TUNING.maxFallSpeed);
    }

    const cap = TUNING.playerMaxSpeed;
    b.vx = Math.max(-cap, Math.min(cap, b.vx));
    b.vy = Math.max(-cap, Math.min(cap, b.vy));
    const res = moveBody(grid, b, b.vx * DT, b.vy * DT, TUNING.playerStepUp, b.grounded || this.swimming);
    if (res.bonked) this.jumping = false;

    this.applyStatuses(grid, sim);
  }

  private applyStatuses(grid: Grid, sim: Simulation): void {
    const b = this.body;
    let fire = 0;
    let steam = 0;
    let water = 0;
    forEachOverlap(grid, b, (_x, _y, _i, m) => {
      if (m === MAT.fire) fire++;
      else if (m === MAT.steam) steam++;
      else if (m === MAT.water) water++;
    });

    // Water puts burning out. Fire sets it (unless we're also in water).
    if (water > 0) this.burning = 0;
    else if (fire > 0) this.burning = TUNING.burnTicks;
    if (fire > 0) this.damage(TUNING.fireContactDps * DT, DAMAGE.fire);
    if (this.burning > 0) {
      this.burning--;
      this.damage(TUNING.burnDps * DT, DAMAGE.burning);
      this.igniteTouched(grid, sim);
    }

    if (steam > 0) {
      this.scalded = TUNING.scaldLinger;
      this.damage(TUNING.scaldDps * DT, DAMAGE.steam);
    } else if (this.scalded > 0) {
      this.scalded--;
    }

    const head = grid.get(Math.floor(b.x), Math.floor(b.y - b.hh + 0.05));
    if (behaviorOf[head] === BEH.powder) {
      this.smothered++;
      if (this.smothered > TUNING.suffocateGraceTicks) this.damage(TUNING.suffocateDps * DT, DAMAGE.buried);
    } else {
      this.smothered = 0;
    }
  }

  /** A burning witch can set oil and wood she touches alight. */
  private igniteTouched(grid: Grid, sim: Simulation): void {
    const b = this.body;
    const x0 = Math.floor(b.x - b.hw) - 1;
    const x1 = Math.floor(b.x + b.hw) + 1;
    const y0 = Math.floor(b.y - b.hh) - 1;
    const y1 = Math.floor(b.y + b.hh) + 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (grid.inBounds(x, y)) sim.exposeToFire(x, y, TUNING.burningIgniteScale);
      }
    }
  }
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}
