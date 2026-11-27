/** Non-material glyphs drawn on top of the world: the player, creatures, UI marks. */
export interface EntityGlyphDef {
  readonly glyph: string;
  readonly color: string;
}

export const ENTITY_GLYPHS = {
  player: { glyph: '@', color: '#f6f0ff' },
  playerBurning: { glyph: '@', color: '#ff9a1f' },
  playerScalded: { glyph: '@', color: '#ff8fb1' },
  playerHurt: { glyph: '@', color: '#ff4d4d' },
  playerDead: { glyph: '@', color: '#5c5c66' },
  /** A kinetic shot (a delivery with no payload). */
  kinetic: { glyph: '•', color: '#f6f0ff' },
  /** Impact sparks. */
  spark: { glyph: '*', color: '#fff3b0' },
  /** The exit portal cycles through these. */
  portalA: { glyph: 'O', color: '#c792ea' },
  portalB: { glyph: 'O', color: '#82aaff' },
  portalC: { glyph: '0', color: '#f6f0ff' },
  /** Glyph chests, closed and opened. */
  chest: { glyph: '&', color: '#ffd23f' },
  chestOpen: { glyph: '&', color: '#4a4a52' },
  /** Fire vents in the floor, burning and doused. */
  vent: { glyph: '≡', color: '#ff5a1f' },
  ventOut: { glyph: '≡', color: '#4a4a52' },
} as const satisfies Record<string, EntityGlyphDef>;

export type EntityGlyphKey = keyof typeof ENTITY_GLYPHS;

/** ASCII map markers: the player spawn, the exit portal, a glyph chest, and a fire vent (a run of V in the floor). */
export const SPAWN_MARKER = '@';
export const EXIT_MARKER = 'O';
export const CHEST_MARKER = '&';
export const VENT_MARKER = 'V';

/** A creature flashes this color when hit. */
export const CREATURE_HURT_COLOR = '#ffffff';
/** A creature winding up an attack flashes this color (the telegraph), with a ! above it. */
export const CREATURE_WINDUP_COLOR = '#ff3b3b';

/** Floating number colors: impacts on creatures, damage over time, hits on the witch, healing. */
export const FLOAT_COLORS = { hit: '#ffffff', burn: '#ffb020', hurt: '#ff4d4d', heal: '#9be22d' } as const;

/** Fizzled glyphs (no charges) are drawn in this grey. */
export const GHOST_COLOR = '#6b6f7c';

export const COLORS = {
  /** Inside the level, empty cells. */
  background: '#0b0b10',
  /** Outside the level bounds. */
  outside: '#050507',
  /** Hover outline around the cell under the cursor. */
  cursor: 'rgba(246, 240, 255, 0.35)',
  /** F3: outline of simulation chunks that are awake. */
  debugChunk: 'rgba(120, 255, 160, 0.18)',
  /** Harvest area ring while right click is held. */
  harvestRing: 'rgba(155, 226, 45, 0.55)',
  /** Harvest ring when the pouch is full for that material. */
  harvestRingFull: 'rgba(255, 77, 77, 0.7)',
} as const;
