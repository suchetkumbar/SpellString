/**
 * The non-material spell glyphs. Every material glyph (see materials.ts) is
 * also a spell glyph: a matter glyph.
 */
export type SpellGlyphKind = 'delivery' | 'split' | 'digit' | 'trigger' | 'chaos' | 'open' | 'close';

export interface SpellGlyphDef {
  readonly glyph: string;
  readonly kind: SpellGlyphKind;
  readonly name: string;
  /** One line for the editor's glyph list. */
  readonly help: string;
  /** Implemented in this build. Unimplemented glyphs parse but can't be owned yet. */
  readonly available: boolean;
}

export const SPELL_GLYPHS: readonly SpellGlyphDef[] = [
  { glyph: '>', kind: 'delivery', name: 'bolt', help: 'fast and straight, toward the cursor', available: true },
  { glyph: ')', kind: 'delivery', name: 'lob', help: 'arcs under gravity', available: true },
  { glyph: '@', kind: 'delivery', name: 'self', help: 'releases around you', available: true },
  { glyph: '_', kind: 'delivery', name: 'mine', help: 'sticks to a surface, bursts when touched', available: true },
  { glyph: '+', kind: 'split', name: 'split', help: 'two more carriers, fanned out', available: true },
  { glyph: '!', kind: 'trigger', name: 'trigger', help: 'on hit, cast the rest from there', available: true },
  { glyph: '?', kind: 'chaos', name: 'chaos', help: 'a random matter glyph you have', available: true },
  { glyph: '[', kind: 'open', name: 'loop', help: 'repeat the casts inside n times', available: true },
  { glyph: ']', kind: 'close', name: 'loop end', help: 'followed by the count', available: true },
  ...['2', '3', '4', '5', '6', '7', '8', '9'].map(
    (d): SpellGlyphDef => ({ glyph: d, kind: 'digit', name: 'repeat', help: 'repeat the matter glyph before it', available: true }),
  ),
];

export const SPELL_GLYPH_BY_CHAR: ReadonlyMap<string, SpellGlyphDef> = new Map(SPELL_GLYPHS.map((g) => [g.glyph, g]));

/**
 * Delivery and modifier glyphs the witch knows at the start of a run. Matter
 * glyphs are owned once she has harvested at least one charge of them.
 * Digits are always owned.
 */
export const STARTING_GLYPHS: readonly string[] = ['>'];
