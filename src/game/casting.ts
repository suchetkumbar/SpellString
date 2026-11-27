import type { Grid } from '../core/grid';
import { BEH, MAX_MATERIALS, behaviorOf } from '../core/materialTable';
import type { Rng } from '../core/rng';
import type { Simulation } from '../core/sim';
import { MATERIALS } from '../data/materials';
import { TUNING } from '../data/tuning';
import { isSolid } from './body';
import type { Pouch } from './harvest';
import type { TickInput } from './input';
import type { DamageSource, Player } from './player';
import { releaseBurst } from './release';
import type { Delivery } from './spell/parse';
import { CHAOS, cutOffMessage, type PlannedCast } from './spell/plan';
import type { Wand } from './wand';

const DT = 1 / TUNING.simHz;
/** Carriers move in steps no longer than this (cells), so they never skip a 1-cell wall. */
const CARRIER_STEP = 0.25;

/** A flying spell carrier (`>` bolt, `)` lob) with the matter it will release. */
export interface Carrier {
  readonly delivery: Delivery;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  readonly gravity: number;
  age: number;
  readonly maxAge: number;
  /** Charges already spent; released on impact. */
  readonly payload: readonly number[];
  /** No payload was written: a kinetic shot (damage and knockback). */
  readonly kinetic: boolean;
  /** Payload was written but every glyph fizzled: 0 or the first fizzled material (drawn greyed). */
  readonly dud: number;
  /** Currently inside a liquid (born underwater carriers swim out instead of bursting at once). */
  inLiquid: boolean;
}

/** Short-lived visual effects: fizzled glyphs popping off the wand, impact sparks. */
export interface Fx {
  readonly kind: 'fizzle' | 'spark';
  readonly material: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  age: number;
  readonly life: number;
}

export type MessageKind = 'info' | 'warn' | 'fizzle';

/** What casting needs from the game. */
export interface CastContext {
  readonly tick: number;
  readonly grid: Grid;
  readonly sim: Simulation;
  readonly player: Player;
  readonly pouch: Pouch;
  readonly wand: Wand;
  readonly rng: Rng;
  say(text: string, kind: MessageKind): void;
}

export const SELF_BOLT: DamageSource = { glyph: '>', text: 'your own bolt' };

/**
 * Casting: turns clicks into casts (mana, cast delay, recharge), spends
 * charges (with fizzles), flies carriers and bursts their payloads.
 */
export class Caster {
  readonly carriers: Carrier[] = [];
  readonly fx: Fx[] = [];
  /** Tick each material last fizzled, for the HUD flash. */
  readonly fizzledAt = new Int32Array(MAX_MATERIALS).fill(-1_000_000);
  /** Rate limit for "not enough mana" messages. */
  private nagUntil = 0;

  update(ctx: CastContext, input: TickInput): void {
    const w = ctx.wand;
    const p = ctx.player;
    w.mana = Math.min(w.stats.maxMana, w.mana + w.stats.manaRegen * DT);
    this.updateCarriers(ctx);
    this.updateFx();

    if (p.dead) {
      w.queue.length = 0;
      return;
    }
    if (w.recharge > 0) w.recharge--;
    if (w.queue.length > 0) {
      if (w.delay > 0) w.delay--;
      if (w.delay <= 0) this.fireNext(ctx, input);
    } else if (input.cast && w.recharge <= 0) {
      this.begin(ctx, input);
    }
  }

  /** A click: pay for the whole spell and queue its casts. */
  private begin(ctx: CastContext, input: TickInput): void {
    const w = ctx.wand;
    const { plan } = w.spell;
    if (!w.spell.ok || plan.casts.length === 0) return;
    if (w.mana < plan.manaCost) {
      if (ctx.tick >= this.nagUntil) {
        ctx.say(`Not enough mana: this spell needs ${plan.manaCost} MP.`, 'warn');
        this.nagUntil = ctx.tick + TUNING.simHz;
      }
      return;
    }
    w.mana -= plan.manaCost;
    if (plan.cutOff) ctx.say(cutOffMessage(plan.cutOff), 'warn');
    w.queue.push(...plan.casts);
    this.fireNext(ctx, input);
  }

  private fireNext(ctx: CastContext, input: TickInput): void {
    const w = ctx.wand;
    const cast = w.queue.shift();
    if (!cast) return;
    const p = ctx.player;
    const ox = p.x;
    const oy = p.y - 0.15;
    let dx = input.aimX - ox;
    let dy = input.aimY - oy;
    if (Math.hypot(dx, dy) < 0.01) {
      dx = p.facing;
      dy = 0;
    }
    p.facing = dx >= 0 ? 1 : -1;
    this.fire(ctx, cast, ox, oy, Math.atan2(dy, dx));
    if (w.queue.length > 0) w.delay = w.stats.castDelayTicks;
    else w.recharge = w.stats.rechargeTicks;
  }

  /** Fire one cast: spend charges per carrier and launch the fan. */
  private fire(ctx: CastContext, cast: PlannedCast, ox: number, oy: number, angle: number): void {
    const spread = (TUNING.splitSpreadDeg * Math.PI) / 180;
    const fizzled: number[] = [];
    for (let k = 0; k < cast.carriers; k++) {
      // 0, +1, -1, +2, -2 ... steps either side of the aim.
      const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
      const a = angle + step * spread;
      const payload: number[] = [];
      let dud = 0;
      for (const planned of cast.payload) {
        const m = planned === CHAOS ? this.chaos(ctx) : planned;
        if (m > 0 && ctx.pouch.spend(m)) {
          payload.push(m);
        } else if (m > 0) {
          if (!fizzled.includes(m)) fizzled.push(m);
          if (dud === 0) dud = m;
        }
      }
      this.launch(cast.delivery, ox, oy, a, payload, cast.payload.length === 0, payload.length === 0 ? dud : 0);
    }
    for (const m of fizzled) {
      this.fizzledAt[m] = ctx.tick;
      this.fx.push({ kind: 'fizzle', material: m, x: ox, y: oy - 0.6, prevX: ox, prevY: oy - 0.6, vx: ctx.rng.range(-1, 1), vy: -3, age: 0, life: 40 });
      const def = MATERIALS[m];
      ctx.say(`Fizzle: no \`${def?.glyph ?? '?'}\` charges (${def?.name ?? '?'}).`, 'fizzle');
    }
  }

  /** `?`: a random matter glyph the witch has charges for (0 if none). */
  private chaos(ctx: CastContext): number {
    const have: number[] = [];
    for (let m = 1; m < MAX_MATERIALS; m++) if (ctx.pouch.count(m) > 0) have.push(m);
    return have.length > 0 ? ctx.rng.pick(have) : 0;
  }

  private launch(delivery: Delivery, x: number, y: number, angle: number, payload: number[], kinetic: boolean, dud: number): void {
    // `@` and `_` arrive in M7; until then they fly like bolts.
    const lob = delivery === ')';
    const speed = lob ? TUNING.lobSpeed : TUNING.boltSpeed;
    this.carriers.push({
      delivery,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: lob ? TUNING.lobGravity : 0,
      age: 0,
      maxAge: lob ? TUNING.lobMaxTicks : Math.ceil((TUNING.boltRange / TUNING.boltSpeed) * TUNING.simHz),
      payload,
      kinetic,
      dud,
      inLiquid: false,
    });
  }

  private updateCarriers(ctx: CastContext): void {
    const { grid } = ctx;
    const body = ctx.player.body;
    let w = 0;
    for (let i = 0; i < this.carriers.length; i++) {
      const c = this.carriers[i]!;
      c.prevX = c.x;
      c.prevY = c.y;
      c.age++;
      if (c.age === 1) c.inLiquid = behaviorOf[grid.get(Math.floor(c.x), Math.floor(c.y))] === BEH.liquid;
      c.vy += c.gravity * DT;
      const mx = c.vx * DT;
      const my = c.vy * DT;
      const steps = Math.max(1, Math.ceil(Math.hypot(mx, my) / CARRIER_STEP));
      let done = false;
      let hitSelf = false;
      for (let s = 0; s < steps; s++) {
        const nx = c.x + mx / steps;
        const ny = c.y + my / steps;
        const m = grid.get(Math.floor(nx), Math.floor(ny));
        if (isSolid(m)) {
          done = true;
          break;
        }
        const liquid = behaviorOf[m] === BEH.liquid;
        if (liquid && !c.inLiquid) {
          done = true; // splash down on the surface
          break;
        }
        c.inLiquid = liquid;
        c.x = nx;
        c.y = ny;
        if (c.age > TUNING.castGraceTicks && Math.abs(c.x - body.x) <= body.hw + 0.1 && Math.abs(c.y - body.y) <= body.hh + 0.1) {
          done = true;
          hitSelf = true;
          break;
        }
      }
      if (hitSelf) this.hitPlayer(ctx, c);
      if (done || c.age >= c.maxAge) {
        this.burst(ctx, c);
        continue;
      }
      this.carriers[w++] = c;
    }
    this.carriers.length = w;
  }

  /** Your own spell hit you. Matter just bursts on you; a kinetic shot also hurts and shoves. */
  private hitPlayer(ctx: CastContext, c: Carrier): void {
    if (!c.kinetic) return;
    const p = ctx.player;
    p.damage(TUNING.kineticDamage * TUNING.selfDamageScale, SELF_BOLT);
    const v = Math.hypot(c.vx, c.vy) || 1;
    p.body.vx += (c.vx / v) * TUNING.kineticKnockback;
    p.body.vy += (c.vy / v) * TUNING.kineticKnockback * 0.6 - 4;
  }

  private burst(ctx: CastContext, c: Carrier): void {
    if (c.payload.length > 0) {
      releaseBurst(ctx.grid, ctx.sim, c.x, c.y, c.payload, TUNING.burstCellsPerGlyph, ctx.rng);
    }
    const sparks = c.payload.length > 0 ? 3 : 2;
    for (let k = 0; k < sparks; k++) {
      const a = ctx.rng.range(0, Math.PI * 2);
      const s = ctx.rng.range(2, 6);
      this.fx.push({ kind: c.dud ? 'fizzle' : 'spark', material: c.dud, x: c.x, y: c.y, prevX: c.x, prevY: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 10 + k * 3 });
    }
  }

  private updateFx(): void {
    let w = 0;
    for (let i = 0; i < this.fx.length; i++) {
      const f = this.fx[i]!;
      f.prevX = f.x;
      f.prevY = f.y;
      f.age++;
      if (f.age >= f.life) continue;
      f.x += f.vx * DT;
      f.y += f.vy * DT;
      f.vx *= 0.9;
      f.vy *= 0.9;
      this.fx[w++] = f;
    }
    this.fx.length = w;
  }
}
