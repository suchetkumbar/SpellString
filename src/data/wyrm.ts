import type { MaterialKey } from './materials';

/**
 * The Wyrm: the boss at the bottom of the descent. A serpent whose body is a
 * string of material segments that burrows through the terrain. Each segment
 * is weak to one reaction: bring the right matter to it. Everything else only
 * chips at it, except explosions, which hurt every segment they reach.
 */
export const WYRM = {
  /** The body, head end first. */
  body: '===^^^~~~###',
  segmentHp: 40,
  /** What each segment material is weak to (the reaction that kills it). */
  weakness: { oil: 'fire', fire: 'water', water: 'ice', rock: 'acid' } as Readonly<Partial<Record<MaterialKey, MaterialKey>>>,
  /** Damage per second while its weakness touches a segment (full contact = 2+ cells). */
  weakDps: 45,
  /** Kinetic hits and heavy impacts only chip it. */
  chipScale: 0.25,
  /** Explosions hurt every segment in reach, at this fraction of the usual blast damage. */
  explosionScale: 0.6,
  /** Cells between segment centres along the body. */
  spacing: 1.3,
  /** Roaming speed, the lunge, and how fast the head can turn (radians/s). */
  speed: 7,
  lungeSpeed: 24,
  turnRate: 3.2,
  /** Lunge: starts within this many cells, telegraphed for windup ticks, lasts lunge ticks, then a cooldown. */
  lungeRange: 15,
  windupTicks: 48,
  lungeTicks: 34,
  cooldownTicks: 150,
  /** Ticks between dives into the rock (when it isn't hunting). */
  diveEvery: [240, 420] as readonly [number, number],
  /** Contact damage: the head while lunging, the head otherwise, and the body. */
  lungeDamage: 22,
  headDamage: 12,
  bodyDamage: 7,
  knockback: 20,
  /** It eats through rock, sand, wood and ice within this radius of its head. */
  burrowRadius: 1.4,
  /** Cells of its material a segment bursts into when destroyed. */
  dropCells: 14,
} as const;

/** The glyph the Wyrm drops: take it to win the run. */
export const LEGENDARY_GLYPH = { glyph: '∞', name: "the Wyrm's eye" } as const;
