import { TUNING } from '../data/tuning';
import type { GameContext } from './context';
import { damageCreature } from './creatures';
import { DAMAGE } from './player';

/**
 * Explosions the simulation queued this tick (gunpowder going up) hit bodies:
 * damage and push fall off from the centre to the edge, and stuck mines in
 * the blast go off too. Blasts while the witch's own fire is about count as
 * hers ("your own explosion"; creatures killed are credited to her spell).
 */
export function applyExplosions(ctx: GameContext): void {
  const list = ctx.sim.explosions;
  if (list.length === 0) return;
  for (const e of list.splice(0)) {
    const reach = e.r + 0.5;
    ctx.emit({ kind: 'explode', x: e.x, y: e.y, r: e.r });
    const own = ctx.player.ownFire > 0;
    const p = ctx.player;
    if (!p.dead) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < reach) {
        const f = 1 - d / reach;
        const dmg = TUNING.explosionDamage * f * (own ? TUNING.selfDamageScale : 1);
        p.damage(dmg, own ? DAMAGE.ownExplosion : DAMAGE.explosion);
        p.body.vx += (dx / (d || 1)) * TUNING.explosionPush * f;
        p.body.vy += (dy / (d || 1)) * TUNING.explosionPush * f - TUNING.explosionPush * 0.3 * f;
        if (dmg >= 0.5) ctx.effects.number(p.x, p.y - 0.8, dmg, 'hurt');
      }
    }
    for (const c of ctx.creatures) {
      if (c.dead) continue;
      const dx = c.x - e.x;
      const dy = c.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d >= reach) continue;
      const f = 1 - d / reach;
      damageCreature(ctx, c, TUNING.explosionDamage * f, 'impact', dx / (d || 1), dy / (d || 1) - 0.4, TUNING.explosionPush * f, own ? 'player' : 'explosion');
    }
    for (const m of ctx.carriers.list) {
      if (m.stuck && Math.hypot(m.x - e.x, m.y - e.y) < reach) m.detonate = true;
    }
    ctx.effects.sparks(e.x, e.y, 6 + Math.round(e.r * 2), ctx.rng);
  }
}
