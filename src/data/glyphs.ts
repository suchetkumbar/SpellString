/** Non-material glyphs drawn on top of the world: the player, creatures, UI marks. */
export interface EntityGlyphDef {
  readonly glyph: string;
  readonly color: string;
}

export const ENTITY_GLYPHS = {
  player: { glyph: '@', color: '#f6f0ff' },
} as const satisfies Record<string, EntityGlyphDef>;

export type EntityGlyphKey = keyof typeof ENTITY_GLYPHS;

/** Glyph used in ASCII maps to mark the player spawn. */
export const SPAWN_MARKER = '@';

export const COLORS = {
  /** Inside the level, empty cells. */
  background: '#0b0b10',
  /** Outside the level bounds. */
  outside: '#050507',
  /** Hover outline around the cell under the cursor. */
  cursor: 'rgba(246, 240, 255, 0.35)',
} as const;
