import { CREATURE_BY_KEY, type CreatureDef, type CreatureKey } from '../data/creatures';
import type { Body } from './body';
import type { DamageSource } from './player';

/**
 * idle: wandering, hasn't noticed the player. chase: hunting the player (or
 * where it last saw her). windup: the telegraph before an attack. attack: the
 * attack itself (dash, lunge, punch). recover: a breather after attacking.
 */
export type CreatureState = 'idle' | 'chase' | 'windup' | 'attack' | 'recover';

/** One creature. Behavior lives in creatures.ts; numbers in data/creatures.ts. */
export class Creature {
  readonly def: CreatureDef;
  readonly body: Body;
  prevX: number;
  prevY: number;
  hp: number;
  readonly maxHp: number;
  state: CreatureState = 'idle';
  /** Ticks spent in the current state. */
  stateTicks = 0;
  facing: 1 | -1 = 1;
  /** Ticks of burning left. */
  burning = 0;
  /** Ticks during which further impacts are ignored. */
  invuln = 0;
  /** Ticks left of the white hurt flash. */
  flash = 0;
  dead = false;
  /** Who or what killed it ('player', a creature key, or a material name). */
  killedBy: string | null = null;
  /** The witch's spell that last hit it, for kill credit. */
  lastSpell: string | null = null;

  /** Could see the player at the last sense check. */
  sees = false;
  /** Ticks of memory left: while > 0 it hunts the last place it saw the player. */
  alert = 0;
  targetX: number;
  targetY: number;
  readonly homeX: number;
  readonly homeY: number;

  /** Ticks until the next attack can start. */
  cooldown = 0;
  /** Attack direction, locked when the windup ends (so a dodge works). */
  aimX = 0;
  aimY = 0;
  /** The current attack has already landed. */
  struck = false;
  wanderDir: -1 | 0 | 1 = 0;
  wanderTicks = 0;
  hopTimer = 0;
  jitterX = 0;
  jitterY = 0;
  /** Blocked sideways last tick (walkers hop over). */
  blocked = false;
  /** Speed multiplier from the materials it touches this tick. */
  slow = 1;
  inLiquid = false;
  /** Damage over time not yet shown as a number. */
  dot = 0;

  constructor(
    readonly id: number,
    key: CreatureKey,
    x: number,
    y: number,
    /** Split generation (slimes): 0 for the original. */
    readonly generation = 0,
  ) {
    const def = CREATURE_BY_KEY.get(key);
    if (!def) throw new Error(`Unknown creature '${key}'`);
    this.def = def;
    this.body = { x, y, vx: 0, vy: 0, hw: def.halfWidth, hh: def.halfHeight, grounded: false, ignore: [] };
    this.prevX = x;
    this.prevY = y;
    this.maxHp = def.hp / 2 ** generation;
    this.hp = this.maxHp;
    this.targetX = x;
    this.targetY = y;
    this.homeX = x;
    this.homeY = y;
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  /** What the death screen says when this creature kills the witch. */
  get source(): DamageSource {
    return { glyph: this.def.glyph, text: this.def.killText };
  }
}
