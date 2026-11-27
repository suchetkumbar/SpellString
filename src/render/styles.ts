import { CREATURES, type CreatureKey } from '../data/creatures';
import { MATERIALS } from '../data/materials';
import { CREATURE_HURT_COLOR, CREATURE_WINDUP_COLOR, ENTITY_GLYPHS, GHOST_COLOR, type EntityGlyphKey } from '../data/glyphs';
import { TUNING } from '../data/tuning';
import { scaleColor } from './color';

export interface GlyphStyle {
  readonly glyph: string;
  readonly color: string;
}

/**
 * Every (glyph, color) pair the renderer draws, indexed for the atlas.
 * Each material has `bands` color bands (band 0 = base color) of `shades`
 * brightness steps each: style = materialFirst[id] + band * shades + shade.
 */
export interface StyleTable {
  readonly styles: readonly GlyphStyle[];
  readonly shades: number;
  /** materialFirst[id] = index of band 0 shade 0 for that material, or -1 for empty. */
  readonly materialFirst: Int16Array;
  /** Number of color bands per material. */
  readonly materialBands: Uint8Array;
  /** Overlay effect per material: 0 none, 1 shimmer (liquids), 2 glint (gold, ice). */
  readonly materialShimmer: Uint8Array;
  /** materialGhost[id] = the material's glyph in grey (fizzles), or -1. */
  readonly materialGhost: Int16Array;
  /** Glow color per material id ('' = none): fire, acid. */
  readonly materialGlow: readonly string[];
  readonly entity: Readonly<Record<EntityGlyphKey, number>>;
  /** Creature looks: normal, hurt flash, burning, and the attack telegraph. */
  readonly creature: Readonly<Record<CreatureKey, CreatureStyles>>;
  /** Background of empty cells. */
  readonly background: string;
}

export interface CreatureStyles {
  readonly normal: number;
  readonly hurt: number;
  readonly burning: number;
  readonly windup: number;
}

export interface StyleOptions {
  /** Brighter, flatter colors on pure black (settings: high contrast). */
  readonly highContrast?: boolean;
}

export function buildStyleTable(opts: StyleOptions = {}): StyleTable {
  const hc = opts.highContrast === true;
  // High contrast: every color brighter, no per-cell shading, black background.
  const tone = (c: string): string => (hc ? scaleColor(c, 1.3) : c);
  const styles: GlyphStyle[] = [];
  const shades: number = TUNING.materialShades;
  const spread: number = hc ? 0 : TUNING.materialShadeSpread;
  const materialFirst = new Int16Array(256).fill(-1);
  const materialBands = new Uint8Array(256);
  const materialShimmer = new Uint8Array(256);
  const materialGhost = new Int16Array(256).fill(-1);
  const materialGlow: string[] = [];

  for (const m of MATERIALS) {
    if (m.behavior === 'empty') continue;
    materialFirst[m.id] = styles.length;
    const bands = [m.color, ...(m.bands ?? [])];
    materialBands[m.id] = bands.length;
    materialShimmer[m.id] = m.shimmer ? 1 : m.glint ? 2 : 0;
    materialGlow[m.id] = m.glow ?? '';
    for (const color of bands) {
      for (let s = 0; s < shades; s++) {
        const t = shades === 1 ? 0 : (s / (shades - 1)) * 2 - 1; // -1 .. 1
        styles.push({ glyph: m.glyph, color: scaleColor(tone(color), 1 + t * spread) });
      }
    }
  }

  for (const m of MATERIALS) {
    if (m.behavior === 'empty') continue;
    materialGhost[m.id] = styles.length;
    styles.push({ glyph: m.glyph, color: GHOST_COLOR });
  }

  const entity = {} as Record<EntityGlyphKey, number>;
  for (const key of Object.keys(ENTITY_GLYPHS) as EntityGlyphKey[]) {
    entity[key] = styles.length;
    const s = ENTITY_GLYPHS[key];
    styles.push({ glyph: s.glyph, color: tone(s.color) });
  }

  const creature = {} as Record<CreatureKey, CreatureStyles>;
  for (const c of CREATURES) {
    const at = (color: string): number => styles.push({ glyph: c.glyph, color }) - 1;
    creature[c.key] = {
      normal: at(tone(c.color)),
      hurt: at(CREATURE_HURT_COLOR),
      burning: at(ENTITY_GLYPHS.playerBurning.color),
      windup: at(CREATURE_WINDUP_COLOR),
    };
  }

  return {
    styles,
    shades,
    materialFirst,
    materialBands,
    materialShimmer,
    materialGhost,
    materialGlow,
    entity,
    creature,
    background: hc ? '#000000' : '#0b0b10',
  };
}
