import type { Rng } from '../core/rng';
import { TUNING } from '../data/tuning';

const DT = 1 / TUNING.simHz;

/** Short-lived glyph effects: fizzled glyphs popping off the wand, impact sparks. */
export interface Fx {
  readonly kind: 'fizzle' | 'spark' | 'debris';
  readonly material: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  age: number;
  readonly life: number;
}

export type FloatKind = 'hit' | 'burn' | 'hurt' | 'heal';

/** A floating damage number. */
export interface FloatText {
  readonly text: string;
  readonly kind: FloatKind;
  readonly x: number;
  y: number;
  prevY: number;
  age: number;
  readonly life: number;
}

/** Visual-only effects. Nothing here affects the simulation. */
export class Effects {
  readonly fx: Fx[] = [];
  readonly texts: FloatText[] = [];

  sparks(x: number, y: number, n: number, rng: Rng, kind: 'spark' | 'fizzle' = 'spark', material = 0): void {
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(2, 6);
      this.fx.push({ kind, material, x, y, prevX: x, prevY: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 10 + k * 3 });
    }
  }

  fizzle(x: number, y: number, material: number, rng: Rng): void {
    this.fx.push({ kind: 'fizzle', material, x, y, prevX: x, prevY: y, vx: rng.range(-1, 1), vy: -3, age: 0, life: 40 });
  }

  /** Impact debris: small glyphs of what burst, thrown up and out (drawn at half size). */
  debris(x: number, y: number, materials: readonly number[], rng: Rng): void {
    if (materials.length === 0) return;
    const n = Math.min(6, 2 + materials.length * 2);
    for (let k = 0; k < n; k++) {
      const a = rng.range(-Math.PI, 0);
      const s = rng.range(5, 11);
      const material = materials[k % materials.length] as number;
      this.fx.push({ kind: 'debris', material, x, y, prevX: x, prevY: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: rng.intRange(16, 28) });
    }
  }

  /** A floating number above (x, y). Amounts under 1 are shown as 1 (something did happen). */
  number(x: number, y: number, amount: number, kind: FloatKind): void {
    const n = Math.max(1, Math.round(Math.abs(amount)));
    const text = kind === 'heal' ? `+${n}` : String(n);
    this.texts.push({ text, kind, x, y, prevY: y, age: 0, life: TUNING.damageNumberTicks });
  }

  update(): void {
    let w = 0;
    for (let i = 0; i < this.fx.length; i++) {
      const f = this.fx[i]!;
      f.prevX = f.x;
      f.prevY = f.y;
      f.age++;
      if (f.age >= f.life) continue;
      f.x += f.vx * DT;
      f.y += f.vy * DT;
      if (f.kind === 'debris') {
        f.vy += 40 * DT; // falls
        f.vx *= 0.97;
      } else {
        f.vx *= 0.9;
        f.vy *= 0.9;
      }
      this.fx[w++] = f;
    }
    this.fx.length = w;

    w = 0;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i]!;
      t.prevY = t.y;
      t.age++;
      if (t.age >= t.life) continue;
      t.y -= TUNING.damageNumberRise * DT;
      this.texts[w++] = t;
    }
    this.texts.length = w;
  }
}
