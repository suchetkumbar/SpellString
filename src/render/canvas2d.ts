import { COLORS } from '../data/glyphs';
import { GlyphAtlas } from './atlas';
import type { ViewTransform } from './camera';
import type { RenderFrame, Renderer } from './renderer';
import type { StyleTable } from './styles';

export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private atlas: GlyphAtlas | null = null;
  view: ViewTransform | null = null;
  dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly styles: StyleTable,
    private readonly fontFamily: string,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
  }

  resize(deviceW: number, deviceH: number, dpr: number): void {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(deviceW));
    const h = Math.max(1, Math.round(deviceH));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  render(frame: RenderFrame): void {
    const { grid, camera } = frame;
    const ctx = this.ctx;
    const cell = camera.cellDevicePx(this.dpr);
    if (!this.atlas || this.atlas.tile !== cell) {
      this.atlas = new GlyphAtlas(this.styles.styles, cell, this.fontFamily);
    }
    const atlas = this.atlas;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const view = camera.transform(grid.width, grid.height, W, H, cell);
    this.view = view;
    const { originX: ox, originY: oy } = view;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = COLORS.outside;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(ox, oy, grid.width * cell, grid.height * cell);

    // Visible cell range.
    const x0 = Math.max(0, Math.floor(-ox / cell));
    const y0 = Math.max(0, Math.floor(-oy / cell));
    const x1 = Math.min(grid.width, Math.ceil((W - ox) / cell));
    const y1 = Math.min(grid.height, Math.ceil((H - oy) / cell));

    const { mat, variant } = grid;
    const first = this.styles.materialFirst;
    const shades = this.styles.shades;
    const src = atlas.canvas;
    const sx = atlas.sx;
    const sy = atlas.sy;

    for (let y = y0; y < y1; y++) {
      const row = y * grid.width;
      const dy = oy + y * cell;
      for (let x = x0; x < x1; x++) {
        const i = row + x;
        const m = mat[i] as number;
        if (m === 0) continue;
        const base = first[m] as number;
        if (base < 0) continue;
        const s = base + ((variant[i] as number) % shades);
        ctx.drawImage(src, sx[s] as number, sy[s] as number, cell, cell, ox + x * cell, dy, cell, cell);
      }
    }

    if (frame.cursor && grid.inBounds(frame.cursor.x, frame.cursor.y)) {
      const lw = Math.max(1, Math.round(this.dpr));
      ctx.strokeStyle = COLORS.cursor;
      ctx.lineWidth = lw;
      ctx.strokeRect(
        ox + frame.cursor.x * cell + lw / 2,
        oy + frame.cursor.y * cell + lw / 2,
        cell - lw,
        cell - lw,
      );
    }

    // Entities draw on top of the world. Snap to whole device pixels to stay crisp.
    for (const e of frame.entities) {
      const s = e.style;
      ctx.drawImage(
        src,
        sx[s] as number,
        sy[s] as number,
        cell,
        cell,
        Math.round(ox + (e.x - 0.5) * cell),
        Math.round(oy + (e.y - 0.5) * cell),
        cell,
        cell,
      );
    }
  }
}
