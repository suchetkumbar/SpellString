import { MAX_MATERIALS } from '../core/materialTable';
import { MATERIALS } from '../data/materials';
import { TUNING } from '../data/tuning';
import type { GameContext } from './context';
import type { TickInput } from './input';
import { CHAOS, cutOffMessage, type PlannedCast } from './spell/plan';
import type { Wand } from './wand';

export type { MessageKind } from './context';
export { SELF_BOLT } from './carriers';

const DT = 1 / TUNING.simHz;

/** A spell as the postcard shows it: no spaces. */
export function spellName(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Casting: turns clicks into casts (mana, cast delay, recharge) and spends
 * charges per carrier, with fizzles. The carriers themselves fly in Carriers.
 */
export class Caster {
  /** Tick each material last fizzled, for the HUD flash. */
  readonly fizzledAt = new Int32Array(MAX_MATERIALS).fill(-1_000_000);
  /** Rate limit for "not enough mana" messages. */
  private nagUntil = 0;

  /**
   * Every wand regenerates and finishes the spell it is firing; a click starts
   * the active wand's spell.
   */
  update(ctx: GameContext, wands: readonly Wand[], input: TickInput): void {
    const p = ctx.player;
    for (const w of wands) {
      w.mana = Math.min(w.stats.maxMana, w.mana + w.stats.manaRegen * DT);
      if (p.dead) {
        w.queue.length = 0;
        continue;
      }
      if (w.recharge > 0) w.recharge--;
      if (w.queue.length > 0) {
        if (w.delay > 0) w.delay--;
        if (w.delay <= 0) this.fireNext(ctx, w, input);
      }
    }
    const active = ctx.wand;
    if (!p.dead && input.cast && active.queue.length === 0 && active.recharge <= 0) this.begin(ctx, active, input);
  }

  /** A click: pay for the whole spell and queue its casts. */
  private begin(ctx: GameContext, w: Wand, input: TickInput): void {
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
    ctx.stats.countCast(spellName(w.spell.text));
    if (plan.cutOff) ctx.say(cutOffMessage(plan.cutOff), 'warn');
    w.queue.push(...plan.casts);
    this.fireNext(ctx, w, input);
  }

  private fireNext(ctx: GameContext, w: Wand, input: TickInput): void {
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
    this.fireCast(ctx, cast, ox, oy, Math.atan2(dy, dx), spellName(w.spell.text), true);
    if (w.queue.length > 0) w.delay = w.stats.castDelayTicks;
    else w.recharge = w.stats.rechargeTicks;
  }

  /**
   * Fire one cast from (ox, oy) along `angle`: spend charges per carrier and
   * launch the fan. `fromWitch`: cast from her wand (an `@` then releases
   * around her rather than on her); false for casts a `!` fires from an impact.
   */
  fireCast(ctx: GameContext, cast: PlannedCast, ox: number, oy: number, angle: number, spell: string, fromWitch: boolean): void {
    const spread = (TUNING.splitSpreadDeg * Math.PI) / 180;
    const fizzled: number[] = [];
    ctx.emit({ kind: 'cast', delivery: cast.delivery });
    for (let k = 0; k < cast.carriers; k++) {
      // 0, +1, -1, +2, -2 ... steps either side of the aim.
      const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
      const payload: number[] = [];
      let dud = 0;
      for (const planned of cast.payload) {
        const m = planned === CHAOS ? this.chaos(ctx) : planned;
        if (m > 0 && ctx.pouch.spend(m)) {
          payload.push(m);
        } else if (m > 0) {
          if (!fizzled.includes(m)) fizzled.push(m);
          if (dud === 0) dud = m;
        } else if (planned === CHAOS && dud === 0) {
          dud = -1; // `?` with nothing to draw on
        }
      }
      ctx.carriers.launch(ctx, {
        delivery: cast.delivery,
        x: ox,
        y: oy,
        angle: angle + step * spread,
        payload,
        kinetic: cast.payload.length === 0,
        dud: payload.length === 0 ? Math.max(0, dud) : 0,
        spell,
        trigger: cast.trigger,
        avoid: fromWitch ? ctx.player.body : undefined,
      });
    }
    for (const m of fizzled) {
      this.fizzledAt[m] = ctx.tick;
      ctx.emit({ kind: 'fizzle' });
      ctx.effects.fizzle(ox, oy - 0.6, m, ctx.rng);
      const def = MATERIALS[m];
      ctx.say(`Fizzle: no \`${def?.glyph ?? '?'}\` charges (${def?.name ?? '?'}).`, 'fizzle');
    }
  }

  /** `?`: a random matter glyph the witch has charges for (0 if none). */
  private chaos(ctx: GameContext): number {
    const have: number[] = [];
    for (let m = 1; m < MAX_MATERIALS; m++) if (ctx.pouch.count(m) > 0) have.push(m);
    return have.length > 0 ? ctx.rng.pick(have) : 0;
  }
}
