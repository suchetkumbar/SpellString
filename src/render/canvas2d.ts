import { COLORS } from '../data/glyphs';
import { TUNING } from '../data/tuning';
import type { Grid } from '../core/grid';
import { GlyphAtlas } from './atlas';
import type { ViewTransform } from './camera';
import type { RenderFrame, Renderer } from './renderer';
import type { StyleTable } from './styles';

/** The glow layer is blurred at this many pixels per cell before being scaled up. */
const GLOW_SCALE = 3;

/** A cached bitmap of one simulation chunk at the current cell size. */
interface ChunkCache {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Chunk index this bitmap currently shows, or -1. */
  chunk: number;
  /** Contains animated cells (fire): redraw every frame. */
  animated: boolean;
}

/**
 * Canvas 2D renderer. The world is drawn from per-chunk bitmaps that are only
 * re-rendered when the simulation marks the chunk dirty (or it holds fire,
 * whose color animates). Water shimmer is a light overlay pass on top.
 * Only visible chunks are cached, so memory stays around one screen's worth.
 */
export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private atlas: GlyphAtlas | null = null;
  view: ViewTransform | null = null;
  dpr = 1;
  /** Visible chunk -> cache. */
  private readonly caches = new Map<number, ChunkCache>();
  private readonly pool: ChunkCache[] = [];
  private cacheCell = 0;
  private cacheGrid: Grid | null = null;
  /** Chunks re-rendered in the last frame (debug). */
  chunksRedrawn = 0;
  /** Settings: no fire flicker. */
  reduceFlashing = false;
  private glowImage: ImageData | null = null;
  private glowCanvas: HTMLCanvasElement | null = null;
  private glowCtx: CanvasRenderingContext2D | null = null;
  private blurCanvas: HTMLCanvasElement | null = null;
  private blurCtx: CanvasRenderingContext2D | null = null;
  private readonly rgbCache = new Map<string, readonly [number, number, number]>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private styles: StyleTable,
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

  /** Swap the style table (high-contrast palette): every cached bitmap is redrawn. */
  setStyles(styles: StyleTable): void {
    this.styles = styles;
    this.atlas = null;
    this.dropCaches(this.cacheCell, this.cacheGrid!);
  }

  clear(): void {
    this.ctx.fillStyle = COLORS.outside;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(frame: RenderFrame): void {
    const { grid, camera, chunks } = frame;
    const ctx = this.ctx;
    const cell = camera.cellDevicePx(this.dpr);
    if (!this.atlas || this.atlas.tile !== cell) {
      this.atlas = new GlyphAtlas(this.styles.styles, cell, this.fontFamily);
    }
    if (cell !== this.cacheCell || grid !== this.cacheGrid) this.dropCaches(cell, grid);

    const W = this.canvas.width;
    const H = this.canvas.height;
    const view = camera.transform(grid.width, grid.height, W, H, cell);
    this.view = view;
    const { originX: ox, originY: oy } = view;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = COLORS.outside;
    ctx.fillRect(0, 0, W, H);

    // Visible cell range.
    const x0 = Math.max(0, Math.floor(-ox / cell));
    const y0 = Math.max(0, Math.floor(-oy / cell));
    const x1 = Math.min(grid.width, Math.ceil((W - ox) / cell));
    const y1 = Math.min(grid.height, Math.ceil((H - oy) / cell));

    // --- World: cached chunk bitmaps.
    const s = chunks.shift;
    const size = 1 << s;
    const cx0 = x0 >> s;
    const cy0 = y0 >> s;
    const cx1 = (Math.max(x0, x1 - 1) >> s) + 1;
    const cy1 = (Math.max(y0, y1 - 1) >> s) + 1;
    this.releaseOutside(cx0, cy0, cx1, cy1, chunks.chunksX);
    this.chunksRedrawn = 0;
    if (x1 > x0 && y1 > y0) {
      for (let cy = cy0; cy < cy1; cy++) {
        for (let cx = cx0; cx < cx1; cx++) {
          const c = cy * chunks.chunksX + cx;
          let cache = this.caches.get(c);
          if (!cache) {
            cache = this.acquire(size * cell);
            this.caches.set(c, cache);
          }
          if (cache.chunk !== c || chunks.dirty[c] || cache.animated) {
            this.drawChunk(cache, grid, c, cx * size, cy * size, size, cell);
            chunks.dirty[c] = 0;
            this.chunksRedrawn++;
          }
          const w = Math.min(size, grid.width - cx * size) * cell;
          const h = Math.min(size, grid.height - cy * size) * cell;
          ctx.drawImage(cache.canvas, 0, 0, w, h, ox + cx * size * cell, oy + cy * size * cell, w, h);
        }
      }
    }

    // --- Shimmer overlay: a few highlighted liquid cells, drifting over time.
    const atlas = this.atlas;
    const src = atlas.canvas;
    const sx = atlas.sx;
    const sy = atlas.sy;
    const { mat, variant } = grid;
    const shimmer = this.styles.materialShimmer;
    const first = this.styles.materialFirst;
    const shades = this.styles.shades;
    const spacing = TUNING.shimmerSpacing;
    const phase = Math.floor(frame.timeMs / TUNING.shimmerPeriodMs);
    // Glints (gold, ice) are rarer and slower than liquid shimmer.
    const glintPhase = Math.floor(frame.timeMs / (TUNING.shimmerPeriodMs * 3));
    const glintSpacing = spacing * 3;
    const glowColor = this.styles.materialGlow;
    const glow = frame.glow === true;
    let glowW = 0;
    let glowData: Uint8ClampedArray | null = null;
    if (glow && x1 > x0 && y1 > y0) {
      glowW = x1 - x0;
      glowData = this.glowBuffer(glowW, y1 - y0);
    }
    for (let y = y0; y < y1; y++) {
      const row = y * grid.width;
      for (let x = x0; x < x1; x++) {
        const i = row + x;
        const m = mat[i] as number;
        if (glowData && glowColor[m]) {
          // One pixel per cell in the glow image; upscaled smoothly (and blurred) below.
          const rgb = this.rgbOf(glowColor[m] as string);
          const o = ((y - y0) * glowW + (x - x0)) * 4;
          glowData[o] = rgb[0];
          glowData[o + 1] = rgb[1];
          glowData[o + 2] = rgb[2];
          glowData[o + 3] = 200;
        }
        const kind = shimmer[m];
        if (!kind) continue;
        const v = (variant[i] as number) >> 2;
        if (kind === 1 ? (v + phase + x + y) % spacing !== 0 : (v * 7 + glintPhase + x * 3 + y) % glintSpacing !== 0) continue;
        const st = (first[m] as number) + shades - 1;
        ctx.drawImage(src, sx[st] as number, sy[st] as number, cell, cell, ox + x * cell, oy + y * cell, cell, cell);
      }
    }
    if (glowData) this.drawGlow(glowW, y1 - y0, ox + x0 * cell, oy + y0 * cell, cell);
    if (frame.lights && frame.lights.length > 0) {
      // Explosion light: soft radial blooms added on top.
      ctx.globalCompositeOperation = 'lighter';
      for (const l of frame.lights) {
        const px = ox + l.x * cell;
        const py = oy + l.y * cell;
        const r = l.r * cell;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(${l.rgb}, ${l.alpha})`);
        g.addColorStop(1, `rgba(${l.rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    const lw = Math.max(1, Math.round(this.dpr));
    if (frame.showActiveChunks) {
      const pxSize = size * cell;
      ctx.strokeStyle = COLORS.debugChunk;
      ctx.lineWidth = lw;
      for (let c = 0; c < chunks.active.length; c++) {
        if (!chunks.active[c]) continue;
        const cx = c % chunks.chunksX;
        const cy = (c - cx) / chunks.chunksX;
        ctx.strokeRect(ox + cx * pxSize + lw / 2, oy + cy * pxSize + lw / 2, pxSize - lw, pxSize - lw);
      }
    }

    if (frame.cursor && grid.inBounds(frame.cursor.x, frame.cursor.y)) {
      ctx.strokeStyle = COLORS.cursor;
      ctx.lineWidth = lw;
      const r = frame.brushRadius ?? 0;
      if (r > 0) {
        ctx.beginPath();
        ctx.arc(ox + (frame.cursor.x + 0.5) * cell, oy + (frame.cursor.y + 0.5) * cell, (r + 0.5) * cell, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeRect(ox + frame.cursor.x * cell + lw / 2, oy + frame.cursor.y * cell + lw / 2, cell - lw, cell - lw);
    }

    if (frame.harvestRing) {
      const h = frame.harvestRing;
      ctx.strokeStyle = h.full ? COLORS.harvestRingFull : COLORS.harvestRing;
      ctx.lineWidth = lw;
      ctx.setLineDash([lw * 3, lw * 3]);
      ctx.beginPath();
      ctx.arc(ox + h.x * cell, oy + h.y * cell, h.radius * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Entities draw on top of the world. Snap to whole device pixels to stay crisp.
    for (const e of frame.entities) {
      const st = e.style;
      const size = e.scale !== undefined ? Math.max(2, Math.round(cell * e.scale)) : cell;
      ctx.drawImage(
        src,
        sx[st] as number,
        sy[st] as number,
        cell,
        cell,
        Math.round(ox + e.x * cell - size / 2),
        Math.round(oy + e.y * cell - size / 2),
        size,
        size,
      );
    }

    // Labels: bold text with a dark outline so it reads over anything.
    if (frame.labels && frame.labels.length > 0) {
      ctx.font = `700 ${Math.max(8, Math.round(cell * 0.8))}px ${this.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, Math.round(cell * 0.18));
      ctx.strokeStyle = COLORS.outside;
      for (const l of frame.labels) {
        ctx.globalAlpha = l.alpha;
        const px = Math.round(ox + l.x * cell);
        const py = Math.round(oy + l.y * cell);
        ctx.strokeText(l.text, px, py);
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, px, py);
      }
      ctx.globalAlpha = 1;
    }

    // A brief white flash for big explosions (off with reduce-flashing; the caller passes 0).
    if (frame.flash && frame.flash > 0.01) {
      ctx.globalAlpha = frame.flash;
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  /** The glow image buffer, cleared, sized w x h (one pixel per visible cell). */
  private glowBuffer(w: number, h: number): Uint8ClampedArray {
    if (!this.glowImage || this.glowImage.width !== w || this.glowImage.height !== h) {
      this.glowImage = new ImageData(w, h);
    }
    this.glowImage.data.fill(0);
    return this.glowImage.data;
  }

  /** Upscale the glow image over the world: smoothed, blurred where supported, added on. */
  private drawGlow(w: number, h: number, dx: number, dy: number, cell: number): void {
    if (!this.glowImage) return;
    if (!this.glowCanvas) {
      this.glowCanvas = document.createElement('canvas');
      this.glowCtx = this.glowCanvas.getContext('2d');
    }
    const gc = this.glowCanvas;
    const gctx = this.glowCtx;
    if (!gctx) return;
    if (gc.width !== w || gc.height !== h) {
      gc.width = w;
      gc.height = h;
    }
    gctx.putImageData(this.glowImage, 0, 0);
    // Blur at low resolution (cheap even without a GPU), then let smooth upscaling spread it.
    if (!this.blurCanvas) {
      this.blurCanvas = document.createElement('canvas');
      this.blurCtx = this.blurCanvas.getContext('2d');
    }
    const bc = this.blurCanvas;
    const bctx = this.blurCtx;
    if (!bctx) return;
    const bw = w * GLOW_SCALE;
    const bh = h * GLOW_SCALE;
    if (bc.width !== bw || bc.height !== bh) {
      bc.width = bw;
      bc.height = bh;
    } else {
      bctx.clearRect(0, 0, bw, bh);
    }
    bctx.imageSmoothingEnabled = true;
    bctx.filter = `blur(${GLOW_SCALE}px)`;
    bctx.drawImage(gc, 0, 0, w, h, 0, 0, bw, bh);
    bctx.filter = 'none';
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bc, 0, 0, bw, bh, dx, dy, w * cell, h * cell);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  /** Parse a #rrggbb color once and cache it. */
  private rgbOf(hex: string): readonly [number, number, number] {
    let c = this.rgbCache.get(hex);
    if (!c) {
      const n = parseInt(hex.slice(1), 16);
      c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      this.rgbCache.set(hex, c);
    }
    return c;
  }

  /** Render one chunk's cells into its cache bitmap. */
  private drawChunk(cache: ChunkCache, grid: Grid, c: number, gx0: number, gy0: number, size: number, cell: number): void {
    const atlas = this.atlas!;
    const ctx = cache.ctx;
    const { mat, variant, life } = grid;
    const first = this.styles.materialFirst;
    const bands = this.styles.materialBands;
    const shades = this.styles.shades;
    const fireHot = TUNING.fireBandLife[0];
    const fireWarm = TUNING.fireBandLife[1];
    const src = atlas.canvas;
    const sx = atlas.sx;
    const sy = atlas.sy;

    ctx.fillStyle = this.styles.background;
    ctx.fillRect(0, 0, size * cell, size * cell);
    let animated = false;
    const gx1 = Math.min(grid.width, gx0 + size);
    const gy1 = Math.min(grid.height, gy0 + size);
    for (let y = gy0; y < gy1; y++) {
      const row = y * grid.width;
      const dy = (y - gy0) * cell;
      for (let x = gx0; x < gx1; x++) {
        const i = row + x;
        const m = mat[i] as number;
        if (m === 0) continue;
        const base = first[m] as number;
        if (base < 0) continue;
        let band = 0;
        const nb = bands[m] as number;
        if (nb > 1) {
          // Fire-like: color by remaining life (fresh -> dying), with a little flicker.
          animated = true;
          const l = life[i] as number;
          band = l === 0 || l > fireHot ? 0 : l > fireWarm ? 1 : 2;
          if (!this.reduceFlashing && Math.random() < TUNING.fireFlickerChance) band++;
          if (band >= nb) band = nb - 1;
        }
        const st = base + band * shades + ((variant[i] as number) % shades);
        ctx.drawImage(src, sx[st] as number, sy[st] as number, cell, cell, (x - gx0) * cell, dy, cell, cell);
      }
    }
    cache.chunk = c;
    cache.animated = animated;
  }

  private acquire(px: number): ChunkCache {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.chunk = -1; // force a redraw for its new chunk
      return pooled;
    }
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not available');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx, chunk: -1, animated: false };
  }

  /** Return caches for chunks that scrolled out of view to the pool. */
  private releaseOutside(cx0: number, cy0: number, cx1: number, cy1: number, chunksX: number): void {
    for (const [c, cache] of this.caches) {
      const cx = c % chunksX;
      const cy = (c - cx) / chunksX;
      if (cx < cx0 || cx >= cx1 || cy < cy0 || cy >= cy1) {
        this.caches.delete(c);
        this.pool.push(cache);
      }
    }
  }

  /** Cell size or world changed: every cached bitmap is the wrong size or content. */
  private dropCaches(cell: number, grid: Grid): void {
    this.caches.clear();
    this.pool.length = 0;
    this.cacheCell = cell;
    this.cacheGrid = grid;
  }
}
