import type { GlyphStyle } from './styles';
import { TUNING } from '../data/tuning';

/**
 * Pre-rendered glyph atlas: every style drawn once into a square tile of
 * `tile` device pixels. Cells are then blitted with drawImage, never fillText.
 * Rebuilt when the device-pixel cell size changes (zoom or devicePixelRatio).
 */
export class GlyphAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly sx: Int32Array;
  readonly sy: Int32Array;

  constructor(
    styles: readonly GlyphStyle[],
    readonly tile: number,
    fontFamily: string,
  ) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(styles.length)));
    const rows = Math.max(1, Math.ceil(styles.length / cols));
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * tile;
    this.canvas.height = rows * tile;
    this.sx = new Int32Array(styles.length);
    this.sy = new Int32Array(styles.length);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    const fontPx = Math.max(4, Math.round(tile * TUNING.glyphScale));
    ctx.font = `${TUNING.glyphWeight} ${fontPx}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Center the font's em box (not each glyph's ink) so glyphs share one baseline.
    const m = ctx.measureText('M');
    const ascent = m.fontBoundingBoxAscent || fontPx * 0.8;
    const descent = m.fontBoundingBoxDescent || fontPx * 0.2;
    const baseline = Math.round(tile / 2 + (ascent - descent) / 2);

    styles.forEach((style, i) => {
      const x = (i % cols) * tile;
      const y = Math.floor(i / cols) * tile;
      this.sx[i] = x;
      this.sy[i] = y;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, tile, tile);
      ctx.clip();
      ctx.fillStyle = style.color;
      ctx.fillText(style.glyph, x + tile / 2, y + baseline);
      ctx.restore();
    });
  }
}
