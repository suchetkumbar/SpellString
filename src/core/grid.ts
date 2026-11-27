import { hash2 } from './rng';

/** Material id returned for out-of-bounds reads. */
export const OUT_OF_BOUNDS = 255;

/**
 * The world grid. One material id per cell plus per-cell scratch data,
 * all in flat typed arrays indexed by y * width + x.
 */
export class Grid {
  readonly mat: Uint8Array;
  /** Per-cell lifetime counter (fire, gas). */
  readonly life: Uint16Array;
  /** Per-cell variant byte, used for color variation. */
  readonly variant: Uint8Array;
  /** Per-cell flags (bit 0: updated this tick). */
  readonly flags: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    /** Seed for cosmetic per-cell variation. */
    readonly variantSeed = 0,
  ) {
    const n = width * height;
    this.mat = new Uint8Array(n);
    this.life = new Uint16Array(n);
    this.variant = new Uint8Array(n);
    this.flags = new Uint8Array(n);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return OUT_OF_BOUNDS;
    return this.mat[y * this.width + x] as number;
  }

  set(x: number, y: number, material: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    this.mat[i] = material;
    this.life[i] = 0;
    this.variant[i] = hash2(x, y, this.variantSeed) & 0xff;
  }

  count(material: number): number {
    let n = 0;
    for (let i = 0; i < this.mat.length; i++) if (this.mat[i] === material) n++;
    return n;
  }
}
