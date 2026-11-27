import type { MaterialKey } from './materials';

/**
 * Creatures: letters drawn over the world, colored by what they're made of.
 * Everything about how they behave lives here; the AI in src/game/creatures.ts
 * only reads these numbers. Speeds are cells/s, times are ticks (60/s).
 */

export type CreatureKey = 'bat' | 'slime' | 'imp' | 'toad' | 'golem';

/** How a creature moves. */
export type Locomotion =
  /** Flies freely with erratic jitter (no gravity). */
  | 'flyer'
  /** Hovers at a distance above and beside its target (no gravity). */
  | 'hover'
  /** Walks along the ground under gravity. */
  | 'walker'
  /** Moves only by hopping. */
  | 'hopper';

/** The telegraphed attack. Every attack has a windup the player can see coming. */
export type AttackKind =
  /** Dash at where the player was when the windup ended. Damages on contact. */
  | 'swoop'
  /** Hop-lunge at the player. Damages on contact. */
  | 'lunge'
  /** Throw a carrier (bolt or lob) with a small payload. */
  | 'shoot'
  /** A short-range punch, with big knockback. */
  | 'punch';

export interface AttackDef {
  readonly kind: AttackKind;
  /** Starts the windup when the player is within this many cells (and seen). */
  readonly range: number;
  /** Telegraph: ticks of visible windup before the attack lands. */
  readonly windup: number;
  /** Ticks the attack itself lasts (dash/lunge), or 0. */
  readonly active: number;
  /** Ticks after the attack before the next windup can start. */
  readonly cooldown: number;
  /** Damage to the player on contact/hit. */
  readonly damage: number;
  /** Knockback speed given to the player, cells/s. */
  readonly knockback: number;
  /** swoop/lunge: speed of the dash, cells/s. */
  readonly speed?: number;
  /** shoot: the projectile. */
  readonly projectile?: {
    readonly delivery: '>' | ')';
    readonly material: MaterialKey;
    /** Cells released on impact. */
    readonly cells: number;
    readonly speed: number;
  };
}

/** How touching a material affects a creature. Materials not listed do nothing. */
export interface MaterialEffect {
  /** Damage per second while touching (at full contact; a single cell does half). Negative heals. */
  readonly dps?: number;
  /** Speed multiplier while touching. */
  readonly slow?: number;
  /** Explicitly unaffected (documents immunities such as fire for the imp). */
  readonly immune?: boolean;
}

export interface CreatureDef {
  readonly key: CreatureKey;
  readonly glyph: string;
  readonly name: string;
  /** "killed by: b (a bat)". */
  readonly killText: string;
  readonly color: string;
  readonly hp: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly locomotion: Locomotion;
  /** Top movement speed, cells/s. */
  readonly speed: number;
  /** Acceleration toward that speed, cells/s^2. */
  readonly accel: number;
  /** Knockback taken is divided by this. */
  readonly mass: number;
  /** Notices the player within this many cells, with line of sight. */
  readonly senseRange: number;
  /** Keeps chasing the last place it saw the player for this many ticks. */
  readonly memoryTicks: number;
  readonly attack: AttackDef;
  /** hopper: hop launch (cells/s) and ticks between hops. */
  readonly hop?: { readonly vx: number; readonly vy: number; readonly every: readonly [number, number] };
  /** hover: preferred offset from the player (sideways, up), in cells. */
  readonly hoverOffset?: readonly [number, number];
  /** Catches fire from fire and burning things. */
  readonly flammable: boolean;
  /** Is always aflame: sets flammable things it touches alight but never burns itself (the imp). */
  readonly fiery?: boolean;
  /** Damage per second while burning. */
  readonly burnDps: number;
  /** Multiplier on kinetic (no-payload) hits. */
  readonly kineticScale: number;
  /** Multiplier on heavy-matter impacts (sand, rock: see HEAVY_IMPACT). */
  readonly heavyScale: number;
  /** Splits into two smaller copies when hit, this many times deep (the slime). */
  readonly splits?: number;
  /** Material released on death, and how many cells (halved per split generation). */
  readonly drop: { readonly material: MaterialKey; readonly cells: number } | null;
  readonly materials: Readonly<Partial<Record<MaterialKey, MaterialEffect>>>;
}

/** Extra impact damage per glyph of heavy matter in a carrier that hits a creature. */
export const HEAVY_IMPACT: Readonly<Partial<Record<MaterialKey, number>>> = {
  sand: 4,
  rock: 6,
  ice: 5,
  gold: 15,
};

export const CREATURES: readonly CreatureDef[] = [
  {
    key: 'bat',
    glyph: 'b',
    name: 'bat',
    killText: 'a bat',
    color: '#b48ead',
    hp: 5,
    halfWidth: 0.35,
    halfHeight: 0.3,
    locomotion: 'flyer',
    speed: 11,
    accel: 50,
    mass: 0.6,
    senseRange: 18,
    memoryTicks: 300,
    attack: { kind: 'swoop', range: 9, windup: 24, active: 32, cooldown: 70, damage: 7, knockback: 12, speed: 26 },
    flammable: true,
    burnDps: 12,
    kineticScale: 1,
    heavyScale: 1,
    drop: null,
    materials: {
      fire: { dps: 20 },
      steam: { dps: 15 },
      water: { dps: 6, slow: 0.4 },
      sand: { slow: 0.4 },
      oil: { slow: 0.4 },
      acid: { dps: 30 },
    },
  },
  {
    key: 'slime',
    glyph: 's',
    name: 'water slime',
    killText: 'a water slime',
    color: '#5aa9ff',
    hp: 24,
    halfWidth: 0.42,
    halfHeight: 0.4,
    locomotion: 'walker',
    speed: 2.6,
    accel: 20,
    mass: 1.2,
    senseRange: 12,
    memoryTicks: 240,
    attack: { kind: 'lunge', range: 4, windup: 30, active: 40, cooldown: 60, damage: 8, knockback: 10, speed: 9 },
    flammable: false,
    burnDps: 0,
    kineticScale: 1,
    heavyScale: 1,
    splits: 2,
    drop: { material: 'water', cells: 16 },
    materials: {
      fire: { dps: 14 },
      steam: { dps: 4 },
      water: { dps: -4 }, // slimes mend in water
      sand: { slow: 0.5 },
      oil: { slow: 0.7 },
      acid: { dps: 20 },
      gunpowder: { slow: 0.6 },
    },
  },
  {
    key: 'imp',
    glyph: 'i',
    name: 'ember imp',
    killText: 'an ember imp',
    color: '#ff8a3d',
    hp: 22,
    halfWidth: 0.35,
    halfHeight: 0.4,
    locomotion: 'hover',
    speed: 7,
    accel: 30,
    mass: 0.8,
    senseRange: 20,
    memoryTicks: 300,
    hoverOffset: [7, 4],
    attack: {
      kind: 'shoot',
      range: 15,
      windup: 40,
      active: 0,
      cooldown: 110,
      damage: 6,
      knockback: 8,
      projectile: { delivery: '>', material: 'fire', cells: 4, speed: 20 },
    },
    flammable: false,
    fiery: true,
    burnDps: 0,
    kineticScale: 1,
    heavyScale: 1,
    drop: { material: 'fire', cells: 10 },
    materials: {
      fire: { immune: true },
      water: { dps: 70, slow: 0.5 },
      steam: { dps: 45 },
      sand: { slow: 0.5 },
      acid: { dps: 25 },
      ice: { dps: 8 }, // cold
    },
  },
  {
    key: 'toad',
    glyph: 't',
    name: 'tar toad',
    killText: 'a tar toad',
    color: '#a06cb0',
    hp: 26,
    halfWidth: 0.42,
    halfHeight: 0.38,
    locomotion: 'hopper',
    speed: 7,
    accel: 30,
    mass: 1.2,
    senseRange: 14,
    memoryTicks: 240,
    hop: { vx: 6, vy: 15, every: [50, 90] },
    attack: {
      kind: 'shoot',
      range: 11,
      windup: 34,
      active: 0,
      cooldown: 100,
      damage: 3,
      knockback: 6,
      projectile: { delivery: ')', material: 'oil', cells: 8, speed: 22 }, // max lob range v^2/g ~ 11.5 cells
    },
    flammable: true,
    burnDps: 5,
    kineticScale: 1,
    heavyScale: 1,
    drop: { material: 'oil', cells: 14 },
    materials: {
      fire: { dps: 6 },
      steam: { dps: 10 },
      oil: { dps: -3 }, // at home in tar
      sand: { slow: 0.5 },
      acid: { dps: 20 },
      gunpowder: { slow: 0.6 },
    },
  },
  {
    key: 'golem',
    glyph: 'G',
    name: 'stone golem',
    killText: 'a stone golem',
    color: '#9aa3b5',
    hp: 110,
    halfWidth: 0.45,
    halfHeight: 0.48,
    locomotion: 'walker',
    speed: 2,
    accel: 10,
    mass: 4,
    senseRange: 12,
    memoryTicks: 360,
    attack: { kind: 'punch', range: 1.9, windup: 36, active: 10, cooldown: 50, damage: 18, knockback: 22 },
    flammable: false,
    burnDps: 0,
    kineticScale: 0.35,
    heavyScale: 2.5,
    drop: { material: 'rock', cells: 10 },
    materials: {
      fire: { immune: true },
      steam: { immune: true },
      water: { slow: 0.6 },
      sand: { slow: 0.7 },
      acid: { dps: 45 }, // acid eats stone
      gunpowder: { slow: 0.8 },
    },
  },
];

export const CREATURE_BY_KEY: ReadonlyMap<CreatureKey, CreatureDef> = new Map(CREATURES.map((c) => [c.key, c]));
export const CREATURE_BY_GLYPH: ReadonlyMap<string, CreatureDef> = new Map(CREATURES.map((c) => [c.glyph, c]));
