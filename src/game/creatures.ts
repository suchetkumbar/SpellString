import type { Grid } from '../core/grid';
import { BEH, MAX_MATERIALS, behaviorOf } from '../core/materialTable';
import { MAT, MATERIALS, type MaterialKey } from '../data/materials';
import { TUNING } from '../data/tuning';
import { isSolid, moveBody, refreshBuried, type Body } from './body';
import type { GameContext } from './context';
import type { Creature, CreatureState } from './creature';
import { lineClear } from './los';
import type { Player } from './player';
import { releaseBurst } from './release';

const DT = 1 / TUNING.simHz;
/** Ticks a creature takes a breather after an attack. */
const RECOVER_TICKS = 30;
/** Ticks between new random flight jitters (bats). */
const JITTER_EVERY = 12;

/** Sight is blocked by solids and by smoke. */
export function blocksSight(m: number): boolean {
  return isSolid(m) || m === MAT.smoke;
}

/** Can the creature see the player: in range, with a clear line between their cells? */
export function canSee(grid: Grid, c: Creature, p: Player): boolean {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const r = c.def.senseRange;
  if (dx * dx + dy * dy > r * r) return false;
  return lineClear(grid, Math.floor(c.x), Math.floor(c.y), Math.floor(p.x), Math.floor(p.y), blocksSight);
}

function overlap(a: Body, b: Body, pad: number): boolean {
  return Math.abs(a.x - b.x) <= a.hw + b.hw + pad && Math.abs(a.y - b.y) <= a.hh + b.hh + pad;
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}

function setState(c: Creature, s: CreatureState): void {
  c.state = s;
  c.stateTicks = 0;
}

/**
 * Hurt a creature. Impacts give knockback, i-frames, a hurt flash and a
 * floating number (and split slimes); damage over time just adds up and is
 * shown in batches. Negative amounts heal. Returns true if it took the damage.
 */
export function damageCreature(
  ctx: GameContext,
  c: Creature,
  amount: number,
  kind: 'impact' | 'dot',
  dirX = 0,
  dirY = 0,
  knock = 0,
  by = 'world',
): boolean {
  if (c.dead) return false;
  if (amount < 0) {
    c.hp = Math.min(c.maxHp, c.hp - amount);
    return true;
  }
  if (kind === 'impact') {
    if (c.invuln > 0) return false;
    c.invuln = TUNING.creatureHitIFrames;
    c.flash = TUNING.hurtFlashTicks;
    c.body.vx += (dirX * knock) / c.def.mass;
    c.body.vy += (dirY * knock * 0.6 - 3) / c.def.mass;
    ctx.effects.number(c.x, c.y - 0.8, amount, 'hit');
    if (by === 'player') {
      // Being hit gives the player away.
      c.alert = c.def.memoryTicks;
      c.targetX = ctx.player.x;
      c.targetY = ctx.player.y;
      if (c.state === 'idle') setState(c, 'chase');
    }
  } else {
    c.dot += amount;
  }
  c.hp -= amount;
  if (c.hp <= 0) {
    kill(ctx, c, by);
  } else if (kind === 'impact' && c.def.splits !== undefined && c.generation < c.def.splits) {
    split(ctx, c);
  }
  return true;
}

function kill(ctx: GameContext, c: Creature, by: string): void {
  c.dead = true;
  c.hp = 0;
  c.killedBy = by;
  if (by === 'player' || c.lastSpell) ctx.stats.countKill(c.lastSpell);
  if (c.dot >= 0.5) ctx.effects.number(c.x, c.y - 0.8, c.dot, 'burn');
  const drop = c.def.drop;
  if (drop) {
    const cells = Math.max(1, Math.round(drop.cells / (c.generation + 1)));
    releaseBurst(ctx.grid, ctx.sim, c.x, c.y, [MAT[drop.material]], cells, ctx.rng);
  }
  ctx.effects.sparks(c.x, c.y, 4, ctx.rng);
}

/** A slime hit hard enough to hurt but not kill splits into two smaller slimes. */
function split(ctx: GameContext, c: Creature): void {
  c.dead = true; // replaced, not killed: no drop
  for (const side of [-1, 1]) {
    const child = ctx.spawnCreature(c.def.key, c.x, c.y, c.generation + 1);
    child.hp = Math.max(1, c.hp / 2);
    child.body.vx = side * 6;
    child.body.vy = -7;
    child.alert = c.alert;
    child.targetX = c.targetX;
    child.targetY = c.targetY;
    child.invuln = TUNING.creatureHitIFrames;
    child.lastSpell = c.lastSpell;
    child.state = c.alert > 0 ? 'chase' : 'idle';
  }
  ctx.effects.sparks(c.x, c.y, 3, ctx.rng);
}

const touched = new Uint16Array(MAX_MATERIALS);
const touchedList: number[] = [];

/** Touching materials: damage, healing, slowing, catching fire and being put out. */
function applyMaterials(ctx: GameContext, c: Creature): void {
  const { grid, sim } = ctx;
  const b = c.body;
  const def = c.def;
  touchedList.length = 0;
  const pad = 0.15;
  const x0 = Math.floor(b.x - b.hw - pad);
  const x1 = Math.floor(b.x + b.hw + pad);
  const y0 = Math.floor(b.y - b.hh - pad);
  const y1 = Math.floor(b.y + b.hh + pad);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const m = grid.get(x, y);
      if (m === 0 || m >= MAX_MATERIALS) continue;
      if (touched[m] === 0) touchedList.push(m);
      touched[m] = (touched[m] as number) + 1;
    }
  }
  c.inLiquid = behaviorOf[grid.get(Math.floor(b.x), Math.floor(b.y))] === BEH.liquid;

  let dmg = 0;
  let heal = 0;
  let slow = 1;
  for (const m of touchedList) {
    const n = touched[m] as number;
    touched[m] = 0;
    if (m === MAT.fire && def.flammable) c.burning = TUNING.burnTicks;
    if (m === MAT.water && !def.fiery) c.burning = 0;
    const e = def.materials[MATERIALS[m]?.key as MaterialKey];
    if (!e || e.immune) continue;
    const f = Math.min(1, n / TUNING.materialFullContactCells);
    if (e.dps !== undefined) {
      if (e.dps > 0) dmg += e.dps * f * DT;
      else heal -= e.dps * f * DT;
    }
    if (e.slow !== undefined) slow = Math.min(slow, e.slow);
  }
  c.slow = slow;

  const aflame = c.burning > 0 || def.fiery === true;
  if (c.burning > 0) {
    c.burning--;
    dmg += def.burnDps * DT;
  }
  if (aflame) {
    // Burning (or fiery) bodies light the oil and wood they touch.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sim.exposeToFire(x, y, TUNING.burningIgniteScale);
  }
  if (heal > 0) damageCreature(ctx, c, -heal, 'dot');
  if (dmg > 0) damageCreature(ctx, c, dmg, 'dot', 0, 0, 0, 'world');
  if (!c.dead && c.dot >= 0.5 && (ctx.tick + c.id) % TUNING.damageNumberEvery === 0) {
    ctx.effects.number(c.x, c.y - 0.8, c.dot, 'burn');
    c.dot = 0;
  }
}

function sense(ctx: GameContext, c: Creature): void {
  const p = ctx.player;
  if (p.dead) {
    c.sees = false;
    c.alert = 0;
  } else if ((ctx.tick + c.id) % TUNING.creatureSenseEvery === 0) {
    c.sees = canSee(ctx.grid, c, p);
    if (c.sees) {
      c.alert = c.def.memoryTicks;
      if (c.state === 'idle') setState(c, 'chase');
    }
  }
  if (c.sees) {
    c.targetX = p.x;
    c.targetY = p.y;
  } else if (c.alert > 0) {
    c.alert--;
  }
  if (c.alert <= 0 && c.state === 'chase') setState(c, 'idle');
}

/** The attack state machine: chase -> windup (telegraph) -> attack -> recover. */
function think(ctx: GameContext, c: Creature): void {
  const a = c.def.attack;
  const p = ctx.player;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  switch (c.state) {
    case 'chase': {
      const grounded = c.def.locomotion === 'flyer' || c.def.locomotion === 'hover' || c.body.grounded;
      if (c.cooldown <= 0 && c.sees && grounded && dx * dx + dy * dy <= a.range * a.range) setState(c, 'windup');
      break;
    }
    case 'windup':
      if (p.dead) setState(c, 'idle');
      else if (c.stateTicks >= a.windup) startAttack(ctx, c);
      break;
    case 'attack': {
      const done =
        c.stateTicks >= a.active ||
        c.struck ||
        (a.kind === 'lunge' && c.stateTicks > 6 && c.body.grounded);
      if (done) {
        c.cooldown = a.cooldown;
        setState(c, 'recover');
      }
      break;
    }
    case 'recover':
      if (c.stateTicks >= RECOVER_TICKS) setState(c, c.alert > 0 ? 'chase' : 'idle');
      break;
    case 'idle':
      break;
  }
}

/** Launch angle for a lob of speed v to hit (dx, dy) under gravity g (low arc), or 45 degrees if out of reach. */
export function lobAngle(dx: number, dy: number, v: number, g: number): number {
  const x = Math.abs(dx);
  const up = -dy; // positive = target above
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * x * x + 2 * up * v2);
  let theta: number;
  if (x < 1e-3) theta = up >= 0 ? Math.PI / 2 : -Math.PI / 2;
  else if (disc < 0) theta = Math.PI / 4;
  else theta = Math.atan((v2 - Math.sqrt(disc)) / (g * x));
  // theta is above the horizontal; convert to screen velocity (y down) facing dx.
  const vx = Math.cos(theta) * v * (dx >= 0 ? 1 : -1);
  // Carriers integrate per tick (vy += g*dt, then move), which acts like launching
  // half a tick of gravity faster; aim that much higher to compensate.
  const vy = -Math.sin(theta) * v - (g * DT) / 2;
  return Math.atan2(vy, vx);
}

function startAttack(ctx: GameContext, c: Creature): void {
  const a = c.def.attack;
  const p = ctx.player;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  c.aimX = dx / d;
  c.aimY = dy / d;
  c.facing = dx >= 0 ? 1 : -1;
  c.struck = false;
  setState(c, 'attack');
  const b = c.body;
  switch (a.kind) {
    case 'swoop':
      b.vx = c.aimX * (a.speed ?? 20);
      b.vy = c.aimY * (a.speed ?? 20);
      break;
    case 'lunge':
      b.vx = c.facing * (a.speed ?? 8) * c.slow;
      b.vy = -(a.speed ?? 8) * 1.2 * c.slow;
      break;
    case 'punch':
      b.vx += c.facing * 6;
      if (overlap(b, p.body, 0.9)) strike(ctx, c);
      break;
    case 'shoot': {
      const pr = a.projectile!;
      const angle = pr.delivery === ')' ? lobAngle(dx, dy, pr.speed, TUNING.lobGravity) : Math.atan2(dy, dx);
      ctx.carriers.launch({
        delivery: pr.delivery,
        x: c.x,
        y: c.y,
        angle,
        speed: pr.speed,
        payload: [MAT[pr.material]],
        perGlyph: pr.cells,
        kinetic: false,
        owner: c,
        hitDamage: a.damage,
        source: { glyph: c.def.glyph, text: `${c.def.killText}'s ${pr.delivery === ')' ? 'spit' : 'fire bolt'}` },
      });
      c.struck = true; // the projectile carries the attack from here
      break;
    }
  }
}

/** The attack connects with the witch. */
function strike(ctx: GameContext, c: Creature): void {
  const p = ctx.player;
  const a = c.def.attack;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  if (p.hit(a.damage, c.source, dx / d, dy / d, a.knockback)) ctx.effects.number(p.x, p.y - 0.8, a.damage, 'hurt');
  c.struck = true;
  if (a.kind === 'swoop') {
    c.body.vx *= -0.4;
    c.body.vy = -6;
  }
}

function move(ctx: GameContext, c: Creature): void {
  const { grid, rng } = ctx;
  const def = c.def;
  const b = c.body;
  const hunting = c.state === 'chase' || c.state === 'windup' || c.state === 'recover';
  const spd = def.speed * c.slow;
  refreshBuried(grid, b);

  // Wander when idle: pick a direction now and then.
  if (c.state === 'idle' && --c.wanderTicks <= 0) {
    c.wanderTicks = rng.intRange(60, 180);
    c.wanderDir = rng.pick([-1, 0, 1] as const);
  }

  if (def.locomotion === 'flyer' || def.locomotion === 'hover') {
    if (!(c.state === 'attack' && def.attack.kind === 'swoop')) {
      let gx: number;
      let gy: number;
      if (c.state === 'idle') {
        gx = c.homeX + c.wanderDir * 4;
        gy = c.homeY + Math.sin((ctx.tick + c.id * 37) * 0.03) * 2;
      } else if (def.locomotion === 'hover') {
        const side = c.x >= c.targetX ? 1 : -1;
        const [ox, oy] = def.hoverOffset ?? [6, 4];
        gx = c.targetX + side * ox;
        gy = c.targetY - oy + Math.sin((ctx.tick + c.id * 13) * 0.08) * 0.8;
      } else if (c.state === 'recover') {
        // Bats peel away after a swoop.
        gx = c.x - Math.sign(c.targetX - c.x || 1) * 5;
        gy = c.targetY - 5;
      } else {
        gx = c.targetX;
        gy = c.targetY - 2.5;
      }
      if (def.locomotion === 'flyer' && (ctx.tick + c.id) % JITTER_EVERY === 0) {
        c.jitterX = rng.range(-1, 1) * spd * 0.7;
        c.jitterY = rng.range(-1, 1) * spd * 0.7;
      }
      const ddx = gx - c.x;
      const ddy = gy - c.y;
      const dist = Math.hypot(ddx, ddy) || 1;
      const sp = c.state === 'windup' ? spd * 0.15 : Math.min(spd, dist * 2.5);
      const tx = (ddx / dist) * sp + (def.locomotion === 'flyer' ? c.jitterX : 0);
      const ty = (ddy / dist) * sp + (def.locomotion === 'flyer' ? c.jitterY : 0);
      b.vx = approach(b.vx, tx, def.accel * DT);
      b.vy = approach(b.vy, ty, def.accel * DT);
    }
    const res = moveBody(grid, b, b.vx * DT, b.vy * DT, 0, false);
    if ((res.hitX || res.hitY) && c.state === 'attack') c.struck = true; // swooped into a wall
  } else {
    if (def.locomotion === 'hopper') {
      if (b.grounded) {
        b.vx = approach(b.vx, 0, 40 * DT);
        if (c.state !== 'windup' && c.state !== 'attack' && --c.hopTimer <= 0) {
          const hop = def.hop!;
          let dir: number;
          if (c.burning > 0) {
            dir = rng.pick([-1, 1]); // panicking
            c.hopTimer = rng.intRange(16, 30);
          } else {
            dir = hunting ? Math.sign(c.targetX - c.x) : c.wanderDir;
            c.hopTimer = rng.intRange(hop.every[0], hop.every[1]);
          }
          if (dir !== 0 || c.burning > 0) {
            b.vx = dir * hop.vx * c.slow;
            b.vy = -hop.vy * c.slow;
          }
        }
      }
    } else if (!(c.state === 'attack' && def.attack.kind === 'lunge')) {
      let dir = 0;
      if (c.state === 'chase') dir = Math.abs(c.targetX - c.x) < 0.3 ? 0 : Math.sign(c.targetX - c.x);
      else if (c.state === 'idle') dir = c.wanderDir;
      b.vx = approach(b.vx, dir * spd, def.accel * DT);
      if (dir !== 0 && b.grounded && c.blocked) b.vy = -12; // hop over a 2-high step
    }
    const g = TUNING.gravity * (c.inLiquid ? TUNING.creatureSwimGravityScale : 1);
    b.vy = Math.min(b.vy + g * DT, c.inLiquid ? TUNING.swimSinkSpeed : TUNING.maxFallSpeed);
    const res = moveBody(grid, b, b.vx * DT, b.vy * DT, TUNING.playerStepUp, b.grounded);
    c.blocked = res.hitX;
  }
  const cap = TUNING.playerMaxSpeed;
  b.vx = Math.max(-cap, Math.min(cap, b.vx));
  b.vy = Math.max(-cap, Math.min(cap, b.vy));
  if (c.state === 'windup' || c.state === 'chase') c.facing = c.targetX >= c.x ? 1 : -1;
  else if (Math.abs(b.vx) > 0.5) c.facing = b.vx > 0 ? 1 : -1;
}

/** Contact with the witch: attacks landing, and fire passing between them. */
function touchPlayer(ctx: GameContext, c: Creature): void {
  const p = ctx.player;
  if (p.dead || !overlap(c.body, p.body, 0.05)) return;
  const a = c.def.attack;
  if (c.state === 'attack' && !c.struck && (a.kind === 'swoop' || a.kind === 'lunge')) strike(ctx, c);
  if (c.burning > 0 || c.def.fiery) p.ignite();
  if (p.burning > 0 && c.def.flammable && !c.inLiquid) c.burning = TUNING.burnTicks;
}

/** One tick of every creature, then burning spreads between them and the dead are removed. */
export function updateCreatures(ctx: GameContext): void {
  const list = ctx.creatures;
  const n = list.length; // creatures spawned this tick (split slimes) start next tick
  for (let i = 0; i < n; i++) {
    const c = list[i]!;
    if (c.dead) continue;
    c.prevX = c.x;
    c.prevY = c.y;
    c.stateTicks++;
    if (c.invuln > 0) c.invuln--;
    if (c.flash > 0) c.flash--;
    if (c.cooldown > 0) c.cooldown--;
    applyMaterials(ctx, c);
    if (c.dead) continue;
    sense(ctx, c);
    think(ctx, c);
    move(ctx, c);
    touchPlayer(ctx, c);
  }

  // Burning spreads between creatures that touch: an imp can set a toad alight.
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    if (a.dead || !(a.burning > 0 || a.def.fiery)) continue;
    for (let j = 0; j < list.length; j++) {
      const b = list[j]!;
      if (j === i || b.dead || !b.def.flammable || b.inLiquid || b.burning > 0) continue;
      if (overlap(a.body, b.body, 0.2)) b.burning = TUNING.burnTicks;
    }
  }

  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i]!.dead) list[w++] = list[i]!;
  list.length = w;
}
