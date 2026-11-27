import type { Game } from '../game/game';
import { creatureView } from './creatureView';
import type { RenderEntity, RenderLabel } from './renderer';
import type { StyleTable } from './styles';

export interface SceneView {
  readonly entities: RenderEntity[];
  readonly labels: RenderLabel[];
  /** The witch's interpolated position (the camera follows it). */
  readonly px: number;
  readonly py: number;
}

/**
 * Everything drawn over the world for one frame, back to front: level
 * features, carriers, effects, harvested glyphs, creatures, then the witch.
 * `a` interpolates between the last two ticks; `now` is wall-clock ms for
 * cosmetic blinking.
 */
export function sceneView(game: Game, styles: StyleTable, a: number, now: number, reduceFlashing = false): SceneView {
  const entities: RenderEntity[] = [];
  const labels: RenderLabel[] = [];
  const e = styles.entity;
  const top = styles.shades - 1;

  // Level features.
  const f = game.features;
  if (f.portal) {
    const cycle = [e.portalA, e.portalB, e.portalA, e.portalC];
    entities.push({ style: reduceFlashing ? e.portalA : cycle[Math.floor(now / 180) % cycle.length]!, x: f.portal.x + 0.5, y: f.portal.y + 0.5 });
  }
  for (const c of f.chests) entities.push({ style: c.opened ? e.chestOpen : e.chest, x: c.x + 0.5, y: c.y + 0.5 });
  for (const v of f.vents) {
    for (let dx = 0; dx < v.spec.w; dx++) entities.push({ style: v.lit ? e.vent : e.ventOut, x: v.spec.x + dx + 0.5, y: v.spec.y + 0.5 });
  }

  for (const c of game.carriers.list) {
    const cx = c.prevX + (c.x - c.prevX) * a;
    const cy = c.prevY + (c.y - c.prevY) * a;
    if (c.stuck) {
      // A mine lying in wait: its _ blinks, alternating with what it holds.
      const m = c.payload[0];
      const showPayload = m !== undefined && !reduceFlashing && Math.floor(now / 400) % 2 === 1;
      entities.push({ style: showPayload ? (styles.materialFirst[m] as number) + top : e.mine, x: cx, y: cy });
      continue;
    }
    let style: number;
    if (c.kinetic) style = e.kinetic;
    else if (c.payload.length === 0) style = styles.materialGhost[c.dud] as number;
    else {
      // Multi-glyph payloads cycle through their glyphs as they fly, with a short dim trail.
      const m = c.payload[(c.age >> 2) % c.payload.length] as number;
      style = (styles.materialFirst[m] as number) + top;
      entities.push({ style: styles.materialFirst[m] as number, x: cx - c.vx * 0.025, y: cy - c.vy * 0.025 });
    }
    entities.push({ style, x: cx, y: cy });
  }
  for (const fx of game.effects.fx) {
    const x = fx.prevX + (fx.x - fx.prevX) * a;
    const y = fx.prevY + (fx.y - fx.prevY) * a;
    if (fx.kind === 'debris') {
      entities.push({ style: (styles.materialFirst[fx.material] as number) + top, x, y, scale: 0.5 });
      continue;
    }
    const style = fx.kind === 'fizzle' && fx.material > 0 ? (styles.materialGhost[fx.material] as number) : e.spark;
    entities.push({ style, x, y });
  }
  for (const g of game.harvester.particles) {
    entities.push({ style: (styles.materialFirst[g.material] as number) + top, x: g.prevX + (g.x - g.prevX) * a, y: g.prevY + (g.y - g.prevY) * a });
  }
  creatureView(game, styles, a, entities, labels, reduceFlashing);

  // The Wyrm: big glyphs of its segments' materials, the head on top; it flashes white while coiling to lunge.
  const w = game.wyrm;
  if (w && !w.defeated) {
    for (let i = w.segments.length - 1; i >= 0; i--) {
      const s = w.segments[i]!;
      const hurt = s.flash > 0 && !reduceFlashing;
      entities.push({
        style: hurt ? (styles.materialGhost[s.material] as number) : (styles.materialFirst[s.material] as number) + top,
        x: s.prevX + (s.x - s.prevX) * a,
        y: s.prevY + (s.y - s.prevY) * a,
        scale: 1.25,
      });
    }
    const hx = w.prevX + (w.x - w.prevX) * a;
    const hy = w.prevY + (w.y - w.prevY) * a;
    const coiling = w.state === 'windup';
    entities.push({ style: coiling && (reduceFlashing || Math.floor(now / 90) % 2 === 0) ? e.wyrmWindup : e.wyrmHead, x: hx, y: hy, scale: 1.4 });
    if (coiling) labels.push({ text: '!', x: hx, y: hy - 1.6, color: '#ff4d4d', alpha: 0.5 + 0.5 * Math.min(1, w.stateTicks / 48) });
  }
  const L = f.legendary;
  if (L && !f.legendaryTaken) entities.push({ style: e.legendary, x: L.x, y: L.y, scale: 1.3 });

  const p = game.player;
  const px = p.prevX + (p.x - p.prevX) * a;
  const py = p.prevY + (p.y - p.prevY) * a;
  // After a creature's blow lands she blinks through her i-frames.
  const blink = !reduceFlashing && !p.dead && p.invuln > 0 && (now >> 6) % 2 === 0;
  const look =
    p.dead || blink
      ? e.playerDead
      : p.burning > 0 && (reduceFlashing || (now >> 6) % 2 === 0)
        ? e.playerBurning
        : p.scalded > 0
          ? e.playerScalded
          : p.hurtThisTick > 0
            ? e.playerHurt
            : e.player;
  entities.push({ style: look, x: px, y: py });
  return { entities, labels, px, py };
}
