import type { Grid } from '../core/grid';
import type { Camera, ViewTransform } from './camera';

/** Something drawn on top of the world at a continuous position. */
export interface RenderEntity {
  /** Index into the StyleTable. */
  readonly style: number;
  /** Center in cell units. */
  readonly x: number;
  readonly y: number;
}

/** Text drawn over everything (damage numbers, telegraph marks), centered on (x, y) in cells. */
export interface RenderLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  /** 0..1 */
  readonly alpha: number;
}

/** Per-chunk change flags from the simulation, so the renderer can cache static chunks. */
export interface ChunkInfo {
  readonly shift: number;
  readonly chunksX: number;
  /** 1 = contents changed since last drawn. The renderer clears entries it redraws. */
  readonly dirty: Uint8Array;
  /** 1 = updated by the simulation last tick (drawn as outlines when `showActive`). */
  readonly active: Uint8Array;
}

export interface RenderFrame {
  readonly grid: Grid;
  readonly chunks: ChunkInfo;
  /** Debug: outline active simulation chunks. */
  readonly showActiveChunks?: boolean;
  readonly camera: Camera;
  readonly entities: readonly RenderEntity[];
  /** Cell under the mouse, if any. */
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Wall-clock ms, for cosmetic animation (shimmer, flicker). */
  readonly timeMs: number;
  /** Harvest area while harvesting: center and radius in cells. */
  readonly harvestRing?: { readonly x: number; readonly y: number; readonly radius: number; readonly full: boolean } | undefined;
  /** Lab brush radius in cells, drawn around the cursor (0 or absent = none). */
  readonly brushRadius?: number;
  /** Floating text on top of everything. */
  readonly labels?: readonly RenderLabel[];
}

/**
 * Renderer boundary. The Canvas2D implementation is the baseline; M9 adds a
 * WebGL post-processing pass behind this same interface.
 */
export interface Renderer {
  /** Resize the backing store, in device pixels. */
  resize(deviceW: number, deviceH: number, dpr: number): void;
  render(frame: RenderFrame): void;
  /** Blank the canvas (behind full-screen menus). */
  clear(): void;
  /** Transform used for the last frame (for mouse -> cell mapping). */
  readonly view: ViewTransform | null;
  readonly dpr: number;
}
