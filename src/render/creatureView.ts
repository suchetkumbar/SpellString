import { FLOAT_COLORS } from '../data/glyphs';
import type { Game } from '../game/game';
import type { RenderEntity, RenderLabel } from './renderer';
import type { StyleTable } from './styles';

/** Ticks per blink of a creature's windup telegraph. */
const TELEGRAPH_BLINK = 4;

/**
 * Creatures, their attack telegraphs and floating damage numbers, for one
 * frame. `a` is the interpolation factor between the last two ticks.
 */
export function creatureView(game: Game, styles: StyleTable, a: number, entities: RenderEntity[], labels: RenderLabel[]): void {
  const tick = game.tick;
  for (const c of game.creatures) {
    if (c.dead) continue;
    const look = styles.creature[c.def.key];
    const x = c.prevX + (c.x - c.prevX) * a;
    const y = c.prevY + (c.y - c.prevY) * a;
    let style = look.normal;
    if (c.flash > 0) style = look.hurt;
    else if (c.state === 'windup') style = ((tick + c.id) / TELEGRAPH_BLINK) % 2 < 1 ? look.windup : look.normal;
    else if (c.burning > 0 && (tick >> 2) % 2 === 0) style = look.burning;
    entities.push({ style, x, y });
    if (c.state === 'windup') {
      // The telegraph: a ! that grows more solid as the attack nears.
      const t = c.stateTicks / Math.max(1, c.def.attack.windup);
      labels.push({ text: '!', x, y: y - 1.1, color: FLOAT_COLORS.hurt, alpha: 0.45 + 0.55 * Math.min(1, t) });
    }
  }
  for (const t of game.effects.texts) {
    const life = t.age / t.life;
    labels.push({
      text: t.text,
      x: t.x,
      y: t.prevY + (t.y - t.prevY) * a,
      color: FLOAT_COLORS[t.kind],
      alpha: life < 0.6 ? 1 : Math.max(0, 1 - (life - 0.6) / 0.4),
    });
  }
}
