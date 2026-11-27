import { TUNING } from '../data/tuning';

/** Maps between cells and device pixels for one frame. */
export interface ViewTransform {
  /** Cell size in device pixels (integer, so glyphs land on whole pixels). */
  readonly cell: number;
  /** Device-pixel position of cell (0, 0)'s top-left corner. Integer. */
  readonly originX: number;
  readonly originY: number;
  readonly canvasW: number;
  readonly canvasH: number;
}

/** Camera center in cell units, with smoothed follow and discrete zoom. Pure math, no DOM. */
export class Camera {
  x = 0;
  y = 0;
  zoomIndex: number = TUNING.defaultZoomIndex;

  get zoom(): number {
    const levels = TUNING.zoomLevels;
    return levels[Math.min(Math.max(this.zoomIndex, 0), levels.length - 1)] as number;
  }

  zoomBy(steps: number): void {
    this.zoomIndex = Math.min(Math.max(this.zoomIndex + steps, 0), TUNING.zoomLevels.length - 1);
  }

  /** Integer cell size in device pixels for the current zoom and devicePixelRatio. */
  cellDevicePx(dpr: number): number {
    return Math.max(4, Math.round(TUNING.cellPx * this.zoom * dpr));
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Frame-rate independent exponential follow. */
  follow(targetX: number, targetY: number, dtSec: number): void {
    const k = 1 - Math.exp(-TUNING.cameraFollowRate * dtSec);
    this.x += (targetX - this.x) * k;
    this.y += (targetY - this.y) * k;
  }

  /** Builds the frame transform, keeping the view inside the level when the level is larger than the view. */
  /** Screen-shake offset in cells, set by the feel layer each frame (0 when shake is off). */
  shakeX = 0;
  shakeY = 0;

  transform(levelW: number, levelH: number, canvasW: number, canvasH: number, cell: number): ViewTransform {
    const cx = clampAxis(this.x, levelW, canvasW / cell);
    const cy = clampAxis(this.y, levelH, canvasH / cell);
    return {
      cell,
      // The shake offset moves the view only (never the level clamp), in whole device pixels.
      originX: Math.round(canvasW / 2 - cx * cell + this.shakeX * cell),
      originY: Math.round(canvasH / 2 - cy * cell + this.shakeY * cell),
      canvasW,
      canvasH,
    };
  }
}

function clampAxis(center: number, levelSize: number, viewSize: number): number {
  if (levelSize <= viewSize) return levelSize / 2;
  const half = viewSize / 2;
  return Math.min(Math.max(center, half), levelSize - half);
}

/** Device-pixel point -> cell coordinates (integer). */
export function screenToCell(t: ViewTransform, devX: number, devY: number): { x: number; y: number } {
  return { x: Math.floor((devX - t.originX) / t.cell), y: Math.floor((devY - t.originY) / t.cell) };
}
