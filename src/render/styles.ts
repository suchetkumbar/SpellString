import { MATERIALS } from '../data/materials';
import { ENTITY_GLYPHS, type EntityGlyphKey } from '../data/glyphs';
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
  /** 1 if the material shimmers (liquids). */
  readonly materialShimmer: Uint8Array;
  readonly entity: Readonly<Record<EntityGlyphKey, number>>;
}

export function buildStyleTable(): StyleTable {
  const styles: GlyphStyle[] = [];
  const shades: number = TUNING.materialShades;
  const spread: number = TUNING.materialShadeSpread;
  const materialFirst = new Int16Array(256).fill(-1);
  const materialBands = new Uint8Array(256);
  const materialShimmer = new Uint8Array(256);

  for (const m of MATERIALS) {
    if (m.behavior === 'empty') continue;
    materialFirst[m.id] = styles.length;
    const bands = [m.color, ...(m.bands ?? [])];
    materialBands[m.id] = bands.length;
    materialShimmer[m.id] = m.shimmer ? 1 : 0;
    for (const color of bands) {
      for (let s = 0; s < shades; s++) {
        const t = shades === 1 ? 0 : (s / (shades - 1)) * 2 - 1; // -1 .. 1
        styles.push({ glyph: m.glyph, color: scaleColor(color, 1 + t * spread) });
      }
    }
  }

  const entity = {} as Record<EntityGlyphKey, number>;
  for (const key of Object.keys(ENTITY_GLYPHS) as EntityGlyphKey[]) {
    entity[key] = styles.length;
    styles.push(ENTITY_GLYPHS[key]);
  }

  return { styles, shades, materialFirst, materialBands, materialShimmer, entity };
}
