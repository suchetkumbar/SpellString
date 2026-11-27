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

export interface RenderFrame {
  readonly grid: Grid;
  readonly camera: Camera;
  readonly entities: readonly RenderEntity[];
  /** Cell under the mouse, if any. */
  readonly cursor: { readonly x: number; readonly y: number } | null;
}

/**
 * Renderer boundary. The Canvas2D implementation is the baseline; M9 adds a
 * WebGL post-processing pass behind this same interface.
 */
export interface Renderer {
  /** Resize the backing store, in device pixels. */
  resize(deviceW: number, deviceH: number, dpr: number): void;
  render(frame: RenderFrame): void;
  /** Transform used for the last frame (for mouse -> cell mapping). */
  readonly view: ViewTransform | null;
  readonly dpr: number;
}
