import { BEH, behaviorOf } from '../core/materialTable';
import { MAT, MATERIALS, MATERIAL_BY_GLYPH, type MaterialKey } from '../data/materials';
import { TUNING } from '../data/tuning';
import { WYRM } from '../data/wyrm';
import type { GameContext } from './context';
import type { DamageSource } from './player';
import { releaseBurst } from './release';

const DT = 1 / TUNING.simHz;
/** How often a weakness touching a segment is used up (ticks): the reaction consumes it. */
const CONSUME_EVERY = 10;
/** Segment and head hit boxes (half size), cells. */
const SEG_HALF = 0.55;
const HEAD_HALF = 0.65;

export type WyrmState = 'roam' | 'dive' | 'windup' | 'lunge' | 'recover';

export interface Segment {
  readonly material: number;
  /** What kills it (a material id), or 0. */
  readonly weakTo: number;
  hp: number;
  readonly maxHp: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Ticks of hurt flash left. */
  flash: number;
  /** Damage over time not yet shown as a number. */
  dot: number;
}

export const WYRM_SOURCE: DamageSource = { glyph: 'W', text: 'the Wyrm' };

/**
 * The Wyrm: a head that steers through rock and air, and a body of material
 * segments following its trail. Segments die to their weaknesses; when the
 * last one goes, the Wyrm is defeated and drops the legendary glyph.
 */
export class Wyrm {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  angle = Math.PI;
  state: WyrmState = 'roam';
  stateTicks = 0;
  cooldown = 120;
  diveTimer = 0;
  diveX = 0;
  diveY = 0;
  lungeX = 0;
  lungeY = 0;
  /** The head's recent positions, newest first: x, y pairs. */
  private readonly trail: number[] = [];
  readonly segments: Segment[] = [];
  defeated = false;
  /** Where it died (for the legendary glyph). */
  deathX = 0;
  deathY = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    for (const ch of WYRM.body) {
      const material = MATERIAL_BY_GLYPH.get(ch) ?? MAT.rock;
      const weak = WYRM.weakness[MATERIALS[material]?.key as MaterialKey];
      this.segments.push({ material, weakTo: weak ? MAT[weak] : 0, hp: WYRM.segmentHp, maxHp: WYRM.segmentHp, x, y, prevX: x, prevY: y, flash: 0, dot: 0 });
    }
    // A straight tail behind the head to start.
    for (let i = 0; i < 400; i++) this.trail.push(x + i * 0.1, y);
  }

  /** Total health left, 0..1 (for the boss bar). */
  get health(): number {
    return this.segments.reduce((s, g) => s + Math.max(0, g.hp), 0) / (WYRM.segmentHp * WYRM.body.length);
  }

  update(ctx: GameContext): void {
    if (this.defeated) return;
    this.prevX = this.x;
    this.prevY = this.y;
    for (const s of this.segments) {
      s.prevX = s.x;
      s.prevY = s.y;
      if (s.flash > 0) s.flash--;
    }
    this.stateTicks++;
    if (this.cooldown > 0) this.cooldown--;
    this.think(ctx);
    this.move(ctx);
    this.placeSegments();
    this.burrow(ctx);
    this.touch(ctx);
    this.weaknesses(ctx);
    if (this.segments.length === 0) this.die(ctx);
  }

  private setState(s: WyrmState): void {
    this.state = s;
    this.stateTicks = 0;
  }

  private think(ctx: GameContext): void {
    const p = ctx.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    switch (this.state) {
      case 'roam':
        if (!p.dead && this.cooldown <= 0 && d < WYRM.lungeRange) this.setState('windup');
        else if (--this.diveTimer <= 0) this.startDive(ctx);
        break;
      case 'dive':
        if (Math.hypot(this.diveX - this.x, this.diveY - this.y) < 2 || this.stateTicks > 240) this.setState('roam');
        break;
      case 'windup':
        if (this.stateTicks >= WYRM.windupTicks) {
          this.lungeX = p.x;
          this.lungeY = p.y;
          this.angle = Math.atan2(p.y - this.y, p.x - this.x);
          this.setState('lunge');
        }
        break;
      case 'lunge':
        if (this.stateTicks >= WYRM.lungeTicks) {
          this.cooldown = WYRM.cooldownTicks;
          this.setState('recover');
        }
        break;
      case 'recover':
        if (this.stateTicks >= 40) this.startDive(ctx);
        break;
    }
  }

  /** Head off into the rock somewhere around the witch, to come back at her from a new side. */
  private startDive(ctx: GameContext): void {
    const p = ctx.player;
    const g = ctx.grid;
    const side = ctx.rng.chance(0.5) ? 1 : -1;
    this.diveX = Math.max(4, Math.min(g.width - 5, p.x + side * ctx.rng.range(12, 26)));
    this.diveY = Math.max(4, Math.min(g.height - 5, p.y + ctx.rng.range(6, 16)));
    this.diveTimer = ctx.rng.intRange(WYRM.diveEvery[0], WYRM.diveEvery[1]);
    this.setState('dive');
  }

  private move(ctx: GameContext): void {
    const p = ctx.player;
    let tx: number;
    let ty: number;
    let speed: number = WYRM.speed;
    if (this.state === 'windup') {
      // Coiling up: barely moves, facing her.
      tx = p.x;
      ty = p.y;
      speed = 1.2;
    } else if (this.state === 'lunge') {
      tx = this.lungeX + Math.cos(this.angle) * 30;
      ty = this.lungeY + Math.sin(this.angle) * 30;
      speed = WYRM.lungeSpeed;
    } else if (this.state === 'dive') {
      tx = this.diveX;
      ty = this.diveY;
    } else {
      tx = p.x;
      ty = p.y;
    }
    // Steer with a limited turn rate, plus a serpentine wiggle.
    const want = Math.atan2(ty - this.y, tx - this.x);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = (this.state === 'lunge' ? 0.6 : WYRM.turnRate) * DT;
    this.angle += Math.max(-turn, Math.min(turn, diff));
    const wiggle = this.state === 'lunge' ? 0 : Math.sin(ctx.tick * 0.12) * 0.6;
    const a = this.angle + wiggle;
    const g = ctx.grid;
    this.x = Math.max(3, Math.min(g.width - 4, this.x + Math.cos(a) * speed * DT));
    this.y = Math.max(3, Math.min(g.height - 4, this.y + Math.sin(a) * speed * DT));
    // Record the trail every bit of movement.
    const lx = this.trail[0] as number;
    const ly = this.trail[1] as number;
    if (Math.hypot(this.x - lx, this.y - ly) >= 0.25) {
      this.trail.unshift(this.x, this.y);
      const keep = Math.ceil(((WYRM.body.length + 2) * WYRM.spacing) / 0.25) * 2 + 4;
      if (this.trail.length > keep) this.trail.length = keep;
    }
  }

  /** Lay the segments out along the trail, `spacing` apart. */
  private placeSegments(): void {
    let want = WYRM.spacing;
    let acc = Math.hypot(this.x - (this.trail[0] as number), this.y - (this.trail[1] as number));
    let k = 0;
    let px = this.x;
    let py = this.y;
    for (const s of this.segments) {
      while (k + 3 < this.trail.length) {
        const ax = this.trail[k] as number;
        const ay = this.trail[k + 1] as number;
        const bx = this.trail[k + 2] as number;
        const by = this.trail[k + 3] as number;
        const step = Math.hypot(bx - ax, by - ay);
        if (acc + step >= want) {
          const t = step > 0 ? (want - acc) / step : 0;
          px = ax + (bx - ax) * t;
          py = ay + (by - ay) * t;
          break;
        }
        acc += step;
        k += 2;
        px = bx;
        py = by;
      }
      s.x = px;
      s.y = py;
      want += WYRM.spacing;
    }
  }

  /** The head eats through solids (and powders) as it goes. */
  private burrow(ctx: GameContext): void {
    const r = WYRM.burrowRadius;
    const g = ctx.grid;
    for (let y = Math.floor(this.y - r); y <= Math.floor(this.y + r); y++) {
      for (let x = Math.floor(this.x - r); x <= Math.floor(this.x + r); x++) {
        if (x < 2 || y < 2 || x >= g.width - 2 || y >= g.height - 2) continue;
        if ((x + 0.5 - this.x) ** 2 + (y + 0.5 - this.y) ** 2 > r * r) continue;
        const b = behaviorOf[g.get(x, y)];
        if (b === BEH.static || b === BEH.powder) ctx.sim.place(x, y, MAT.empty);
      }
    }
  }

  /** Contact with the witch: the head (hardest when lunging) and the body. */
  private touch(ctx: GameContext): void {
    const p = ctx.player;
    if (p.dead) return;
    const b = p.body;
    const hits = (x: number, y: number, half: number): boolean => Math.abs(x - b.x) < b.hw + half && Math.abs(y - b.y) < b.hh + half;
    const blow = (x: number, y: number, dmg: number): void => {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (p.hit(dmg, WYRM_SOURCE, dx / d, dy / d, WYRM.knockback)) ctx.effects.number(p.x, p.y - 0.8, dmg, 'hurt');
    };
    if (hits(this.x, this.y, HEAD_HALF)) blow(this.x, this.y, this.state === 'lunge' ? WYRM.lungeDamage : WYRM.headDamage);
    for (const s of this.segments) {
      if (!hits(s.x, s.y, SEG_HALF)) continue;
      blow(s.x, s.y, WYRM.bodyDamage);
      if (s.material === MAT.fire) p.ignite();
    }
  }

  /** Each segment's weakness eats at it, and is used up in the reaction. */
  private weaknesses(ctx: GameContext): void {
    const g = ctx.grid;
    for (const s of this.segments) {
      const cx = Math.floor(s.x);
      const cy = Math.floor(s.y);
      let n = 0;
      let fx = 0;
      let fy = 0;
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          const m = g.get(x, y);
          if (s.weakTo && m === s.weakTo) {
            n++;
            fx = x;
            fy = y;
          }
          // Fire segments set what they touch alight; oil segments ooze.
          if (s.material === MAT.fire) ctx.sim.exposeToFire(x, y, 0.5);
        }
      }
      if (s.material === MAT.oil && (ctx.tick + cx) % 50 === 0 && g.get(cx, cy + 1) === MAT.empty) ctx.sim.place(cx, cy + 1, MAT.oil);
      if (n > 0) {
        this.damage(ctx, s, WYRM.weakDps * Math.min(1, n / 2) * DT, true);
        if ((ctx.tick + cx + cy) % CONSUME_EVERY === 0) ctx.sim.place(fx, fy, s.material === MAT.fire ? MAT.steam : MAT.empty);
      }
    }
    // Destroyed segments burst into their material and drop out of the body.
    const alive = this.segments.filter((s) => {
      if (s.hp > 0) return true;
      this.burst(ctx, s);
      return false;
    });
    this.segments.splice(0, this.segments.length, ...alive);
  }

  /** A segment destroyed: it bursts into its material. */
  private burst(ctx: GameContext, s: Segment): void {
    releaseBurst(ctx.grid, ctx.sim, s.x, s.y, [s.material], WYRM.dropCells, ctx.rng);
    ctx.effects.sparks(s.x, s.y, 6, ctx.rng);
    ctx.emit({ kind: 'kill', x: s.x, y: s.y });
    ctx.say(`A \`${MATERIALS[s.material]?.glyph ?? '?'}\` segment of the Wyrm bursts!`, 'info');
  }

  /** Hurt a segment. `weak`: its weakness (full damage); otherwise chip damage. */
  damage(ctx: GameContext, s: Segment, amount: number, weak: boolean): void {
    if (amount <= 0) return;
    const dmg = weak ? amount : amount * WYRM.chipScale;
    s.hp -= dmg;
    s.flash = 4;
    if (weak) {
      s.dot += dmg;
      if (s.dot >= 4) {
        ctx.effects.number(s.x, s.y - 0.9, s.dot, 'burn');
        s.dot = 0;
      }
    } else {
      ctx.effects.number(s.x, s.y - 0.9, dmg, 'hit');
    }
    ctx.emit({ kind: 'hit', x: s.x, y: s.y, amount: dmg });
  }

  /** What's at (x, y): a segment, the head, or nothing. */
  bodyAt(x: number, y: number): Segment | 'head' | null {
    if (this.defeated) return null;
    if (Math.abs(x - this.x) < HEAD_HALF && Math.abs(y - this.y) < HEAD_HALF) return 'head';
    for (const s of this.segments) if (Math.abs(x - s.x) < SEG_HALF && Math.abs(y - s.y) < SEG_HALF) return s;
    return null;
  }

  /** An explosion: every segment in reach takes a share. */
  blast(ctx: GameContext, x: number, y: number, r: number): void {
    for (const s of this.segments) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < r + 0.5) this.damage(ctx, s, TUNING.explosionDamage * WYRM.explosionScale * (1 - d / (r + 0.5)), true);
    }
  }

  private die(ctx: GameContext): void {
    this.defeated = true;
    this.deathX = this.x;
    this.deathY = this.y;
    releaseBurst(ctx.grid, ctx.sim, this.x, this.y, [MAT.fire, MAT.gold], 12, ctx.rng);
    ctx.effects.sparks(this.x, this.y, 12, ctx.rng);
    ctx.emit({ kind: 'explode', x: this.x, y: this.y, r: 6 });
    ctx.say('The Wyrm comes apart. Its eye glints where it fell.', 'info');
  }
}
