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
import type { PlannedCast } from './spell/plan';

const DT = 1 / TUNING.simHz;
/** Carriers move in steps no longer than this (cells), so they never skip a 1-cell wall. */
const CARRIER_STEP = 0.25;
/** Hit test padding around bodies, cells. */
const HIT_PAD = 0.1;

export const SELF_BOLT: DamageSource = { glyph: '>', text: 'your own bolt' };

/**
 * A carrier: `>` bolt, `)` lob or `_` mine, with the matter it will release
 * and (for `!`) the casts to fire from wherever it bursts. `@` never flies: it
 * bursts on the spot (see Carriers.launch).
 */
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
  /** The witch's spell that fired it (for kill credit), or null. */
  readonly spell: string | null;
  /** `!`: casts fired from the burst point, along the carrier's direction. */
  readonly trigger: readonly PlannedCast[];
  /** The launch direction (triggers from a stuck mine use it). */
  readonly angle: number;
  /** A `_` mine: sticks to the first surface and waits for a creature. */
  readonly mine: boolean;
  stuck: boolean;
  /** Set by an explosion: burst on the next update. */
  detonate: boolean;
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
  readonly spell?: string | null;
  readonly trigger?: readonly PlannedCast[];
  /** `@`: a body the release leaves room for (the witch casting around herself). */
  readonly avoid?: Body;
}

function overlaps(b: Body, x: number, y: number, pad = HIT_PAD): boolean {
  return Math.abs(x - b.x) <= b.hw + pad && Math.abs(y - b.y) <= b.hh + pad;
}

/** All carriers in flight (and mines lying in wait), whoever threw them. */
export class Carriers {
  readonly list: Carrier[] = [];

  /** Launch a carrier. `@` bursts at once and returns null. */
  launch(ctx: GameContext, s: LaunchSpec): Carrier | null {
    if (s.delivery === '@') {
      this.selfBurst(ctx, s);
      return null;
    }
    const lob = s.delivery === ')';
    const mine = s.delivery === '_';
    const speed = s.speed ?? (lob ? TUNING.lobSpeed : mine ? TUNING.mineSpeed : TUNING.boltSpeed);
    const c: Carrier = {
      delivery: s.delivery,
      x: s.x,
      y: s.y,
      prevX: s.x,
      prevY: s.y,
      vx: Math.cos(s.angle) * speed,
      vy: Math.sin(s.angle) * speed,
      gravity: lob ? TUNING.lobGravity : mine ? TUNING.mineGravity : 0,
      age: 0,
      maxAge: lob || mine ? TUNING.lobMaxTicks : Math.ceil((TUNING.boltRange / speed) * TUNING.simHz),
      payload: s.payload,
      perGlyph: s.perGlyph ?? TUNING.burstCellsPerGlyph,
      kinetic: s.kinetic,
      dud: s.dud ?? 0,
      inLiquid: false,
      owner: s.owner ?? null,
      hitDamage: s.hitDamage ?? 0,
      source: s.source ?? SELF_BOLT,
      spell: s.spell ?? null,
      trigger: s.trigger ?? [],
      angle: s.angle,
      mine,
      stuck: false,
      detonate: false,
    };
    this.list.push(c);
    return c;
  }

  update(ctx: GameContext): void {
    const { grid } = ctx;
    // Bursts can fire triggers that launch new carriers: those start moving next tick.
    const current = this.list.splice(0, this.list.length);
    const keep: Carrier[] = [];
    for (const c of current) {
      c.prevX = c.x;
      c.prevY = c.y;
      c.age++;
      if (c.detonate) {
        this.burst(ctx, c);
        continue;
      }
      if (c.stuck) {
        // A mine lying in wait: a creature close by (or old age) sets it off.
        if (c.age >= TUNING.mineLifetimeTicks || ctx.creatures.some((cr) => !cr.dead && overlaps(cr.body, c.x, c.y, TUNING.mineTriggerRadius))) {
          this.burst(ctx, c);
        } else {
          keep.push(c);
        }
        continue;
      }
      if (c.age === 1) c.inLiquid = behaviorOf[grid.get(Math.floor(c.x), Math.floor(c.y))] === BEH.liquid;
      c.vy += c.gravity * DT;
      const mx = c.vx * DT;
      const my = c.vy * DT;
      const steps = Math.max(1, Math.ceil(Math.hypot(mx, my) / CARRIER_STEP));
      let hitWorld = false;
      let hitBody = false;
      for (let s = 0; s < steps && !hitWorld && !hitBody; s++) {
        const nx = c.x + mx / steps;
        const ny = c.y + my / steps;
        const m = grid.get(Math.floor(nx), Math.floor(ny));
        if (isSolid(m)) {
          hitWorld = true;
          break;
        }
        const liquid = behaviorOf[m] === BEH.liquid;
        if (liquid && !c.inLiquid) {
          hitWorld = true; // splash down on the surface
          break;
        }
        c.inLiquid = liquid;
        c.x = nx;
        c.y = ny;
        hitBody = this.hitBodies(ctx, c);
      }
      if (hitWorld && c.mine) {
        // Mines stick where they land and wait.
        c.stuck = true;
        c.vx = 0;
        c.vy = 0;
        c.age = 0;
        keep.push(c);
        continue;
      }
      if (hitWorld || hitBody || c.age >= c.maxAge) {
        this.burst(ctx, c);
        continue;
      }
      keep.push(c);
    }
    // Keep survivors first, then anything launched by triggers this tick.
    this.list.unshift(...keep);
  }

  /** Did the carrier fly into the witch or a creature? Applies the hit. */
  private hitBodies(ctx: GameContext, c: Carrier): boolean {
    const grace = c.age <= TUNING.castGraceTicks;
    const p = ctx.player;
    if (!p.dead && c.owner !== null && overlaps(p.body, c.x, c.y)) {
      this.hitPlayer(ctx, c);
      return true;
    }
    // Your own carriers can hit you after the grace period (mines never do).
    if (!p.dead && c.owner === null && !grace && !c.mine && overlaps(p.body, c.x, c.y)) {
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
    if (c.owner === null && c.spell) cr.lastSpell = c.spell;
    damageCreature(ctx, cr, dmg, 'impact', c.vx / v, c.vy / v, knock, c.owner === null ? 'player' : c.owner.def.key);
  }

  /** `@`: release right here (leaving room for `avoid`), shove nearby creatures if kinetic, then fire any trigger. */
  private selfBurst(ctx: GameContext, s: LaunchSpec): void {
    if (s.payload.length > 0) {
      releaseBurst(ctx.grid, ctx.sim, s.x, s.y, s.payload, s.perGlyph ?? TUNING.burstCellsPerGlyph, ctx.rng, s.avoid);
      if ((s.owner ?? null) === null) ctx.noteOwnBurst(s.x, s.y, s.payload);
      ctx.effects.sparks(s.x, s.y, 4, ctx.rng);
    } else if (s.kinetic) {
      this.blast(ctx, s.x, s.y, TUNING.selfBlastRadius, s.spell ?? null);
    } else if (s.dud) {
      ctx.effects.sparks(s.x, s.y, 2, ctx.rng, 'fizzle', s.dud);
    }
    if (s.trigger && s.trigger.length > 0) ctx.castFrom(s.trigger, s.x, s.y, s.angle, s.spell ?? null);
  }

  /** A kinetic shockwave: creatures within the radius are hurt and pushed away. */
  private blast(ctx: GameContext, x: number, y: number, radius: number, spell: string | null): void {
    for (const cr of ctx.creatures) {
      if (cr.dead) continue;
      const dx = cr.x - x;
      const dy = cr.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      if (spell) cr.lastSpell = spell;
      const f = 1 - d / (radius + 0.5);
      damageCreature(ctx, cr, TUNING.kineticDamage * cr.def.kineticScale, 'impact', dx / (d || 1), dy / (d || 1) - 0.3, TUNING.kineticKnockback * (0.5 + f), 'player');
    }
    ctx.effects.sparks(x, y, 6, ctx.rng);
  }

  private burst(ctx: GameContext, c: Carrier): void {
    if (c.payload.length > 0) {
      releaseBurst(ctx.grid, ctx.sim, c.x, c.y, c.payload, c.perGlyph, ctx.rng);
      if (c.owner === null) ctx.noteOwnBurst(c.x, c.y, c.payload);
    } else if (c.kinetic && c.mine) {
      this.blast(ctx, c.x, c.y, TUNING.mineBlastRadius, c.spell);
    }
    if (c.dud) ctx.effects.sparks(c.x, c.y, 2, ctx.rng, 'fizzle', c.dud);
    else ctx.effects.sparks(c.x, c.y, c.payload.length > 0 ? 3 : 2, ctx.rng);
    if (c.trigger.length > 0) {
      const moving = Math.hypot(c.vx, c.vy) > 0.01;
      ctx.castFrom(c.trigger, c.x, c.y, moving ? Math.atan2(c.vy, c.vx) : c.angle, c.spell);
    }
  }
}
