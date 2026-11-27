import { BEH, behaviorOf } from '../core/materialTable';
import { HEAVY_IMPACT } from '../data/creatures';
import { MATERIALS, type MaterialKey } from '../data/materials';
import { TUNING } from '../data/tuning';
import { isSolid, type Body } from './body';
import type { GameContext } from './context';
import type { Creature } from './creature';
import { damageCreature } from './creatures';
import type { DamageSource } from './player';
import { releaseBurst } from './release';
import type { Delivery } from './spell/parse';

const DT = 1 / TUNING.simHz;
/** Carriers move in steps no longer than this (cells), so they never skip a 1-cell wall. */
const CARRIER_STEP = 0.25;
/** Hit test padding around bodies, cells. */
const HIT_PAD = 0.1;

export const SELF_BOLT: DamageSource = { glyph: '>', text: 'your own bolt' };

/** A flying carrier (`>` bolt, `)` lob) with the matter it will release. */
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
  /** Cells released per payload glyph. */
  readonly perGlyph: number;
  /** No payload was written: a kinetic shot (damage and knockback). */
  readonly kinetic: boolean;
  /** Payload was written but every glyph fizzled: 0 or the first fizzled material (drawn greyed). */
  readonly dud: number;
  /** Currently inside a liquid (carriers born underwater swim out instead of bursting at once). */
  inLiquid: boolean;
  /** Who threw it: null for the witch, else the creature. Owners are safe from it for a moment. */
  readonly owner: Creature | null;
  /** Creature projectiles: damage on hitting a body, and what the death screen calls it. */
  readonly hitDamage: number;
  readonly source: DamageSource;
}

export interface LaunchSpec {
  readonly delivery: Delivery;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly payload: number[];
  readonly kinetic: boolean;
  readonly dud?: number;
  readonly perGlyph?: number;
  /** Overrides the delivery's speed. */
  readonly speed?: number;
  readonly owner?: Creature | null;
  readonly hitDamage?: number;
  readonly source?: DamageSource;
}

function overlaps(b: Body, x: number, y: number): boolean {
  return Math.abs(x - b.x) <= b.hw + HIT_PAD && Math.abs(y - b.y) <= b.hh + HIT_PAD;
}

/** All carriers in flight, whoever threw them. */
export class Carriers {
  readonly list: Carrier[] = [];

  launch(s: LaunchSpec): Carrier {
    // `@` and `_` arrive in M7; until then they fly like bolts.
    const lob = s.delivery === ')';
    const speed = s.speed ?? (lob ? TUNING.lobSpeed : TUNING.boltSpeed);
    const c: Carrier = {
      delivery: s.delivery,
      x: s.x,
      y: s.y,
      prevX: s.x,
      prevY: s.y,
      vx: Math.cos(s.angle) * speed,
      vy: Math.sin(s.angle) * speed,
      gravity: lob ? TUNING.lobGravity : 0,
      age: 0,
      maxAge: lob ? TUNING.lobMaxTicks : Math.ceil((TUNING.boltRange / speed) * TUNING.simHz),
      payload: s.payload,
      perGlyph: s.perGlyph ?? TUNING.burstCellsPerGlyph,
      kinetic: s.kinetic,
      dud: s.dud ?? 0,
      inLiquid: false,
      owner: s.owner ?? null,
      hitDamage: s.hitDamage ?? 0,
      source: s.source ?? SELF_BOLT,
    };
    this.list.push(c);
    return c;
  }

  update(ctx: GameContext): void {
    const { grid } = ctx;
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i]!;
      c.prevX = c.x;
      c.prevY = c.y;
      c.age++;
      if (c.age === 1) c.inLiquid = behaviorOf[grid.get(Math.floor(c.x), Math.floor(c.y))] === BEH.liquid;
      c.vy += c.gravity * DT;
      const mx = c.vx * DT;
      const my = c.vy * DT;
      const steps = Math.max(1, Math.ceil(Math.hypot(mx, my) / CARRIER_STEP));
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
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
        done = this.hitBodies(ctx, c);
      }
      if (done || c.age >= c.maxAge) {
        this.burst(ctx, c);
        continue;
      }
      this.list[w++] = c;
    }
    this.list.length = w;
  }

  /** Did the carrier fly into the witch or a creature? Applies the hit. */
  private hitBodies(ctx: GameContext, c: Carrier): boolean {
    const grace = c.age <= TUNING.castGraceTicks;
    const p = ctx.player;
    if (!p.dead && !(grace && c.owner === null) && overlaps(p.body, c.x, c.y)) {
      this.hitPlayer(ctx, c);
      return true;
    }
    for (const cr of ctx.creatures) {
      if (cr.dead || (grace && cr === c.owner)) continue;
      if (overlaps(cr.body, c.x, c.y)) {
        this.hitCreature(ctx, c, cr);
        return true;
      }
    }
    return false;
  }

  private hitPlayer(ctx: GameContext, c: Carrier): void {
    const p = ctx.player;
    const v = Math.hypot(c.vx, c.vy) || 1;
    if (c.owner) {
      if (p.hit(c.hitDamage, c.source, c.vx / v, c.vy / v, c.owner.def.attack.knockback)) {
        ctx.effects.number(p.x, p.y - 0.8, c.hitDamage, 'hurt');
      }
      return;
    }
    // Your own spell. Matter just bursts on you; a kinetic shot also hurts and shoves.
    if (!c.kinetic) return;
    p.damage(TUNING.kineticDamage * TUNING.selfDamageScale, SELF_BOLT);
    p.body.vx += (c.vx / v) * TUNING.kineticKnockback;
    p.body.vy += (c.vy / v) * TUNING.kineticKnockback * 0.6 - 4;
  }

  private hitCreature(ctx: GameContext, c: Carrier, cr: Creature): void {
    const def = cr.def;
    let dmg: number;
    let knock: number;
    if (c.owner) {
      dmg = c.hitDamage;
      knock = c.owner.def.attack.knockback;
    } else if (c.kinetic) {
      dmg = TUNING.kineticDamage * def.kineticScale;
      knock = TUNING.kineticKnockback;
    } else {
      dmg = TUNING.carrierImpactDamage;
      for (const m of c.payload) dmg += (HEAVY_IMPACT[MATERIALS[m]?.key as MaterialKey] ?? 0) * def.heavyScale;
      knock = TUNING.kineticKnockback * 0.5;
    }
    const v = Math.hypot(c.vx, c.vy) || 1;
    damageCreature(ctx, cr, dmg, 'impact', c.vx / v, c.vy / v, knock, c.owner === null ? 'player' : c.owner.def.key);
  }

  private burst(ctx: GameContext, c: Carrier): void {
    if (c.payload.length > 0) releaseBurst(ctx.grid, ctx.sim, c.x, c.y, c.payload, c.perGlyph, ctx.rng);
    if (c.dud) ctx.effects.sparks(c.x, c.y, 2, ctx.rng, 'fizzle', c.dud);
    else ctx.effects.sparks(c.x, c.y, c.payload.length > 0 ? 3 : 2, ctx.rng);
  }
}
