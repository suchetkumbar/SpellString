import { MATERIALS } from '../data/materials';
import type { Token } from '../game/spell/parse';

const GLYPH_COLOR = '#f6f0ff';
const DIGIT_COLOR = '#a9b1c4';

/** Display color for a spell glyph: matter in its material color, the rest in white. */
export function glyphColor(t: Token): string {
  if (t.kind === 'matter') return MATERIALS[t.material]?.color ?? GLYPH_COLOR;
  if (t.kind === 'digit') return DIGIT_COLOR;
  return GLYPH_COLOR;
}

/**
 * A spell drawn as wand slots: `[>][~][^][ ]`. `flag(i)` adds a class to the
 * i-th glyph (nocharge, fizzle, missing, error). Glyphs past the wand's
 * capacity get the `over` class.
 */
export function renderSpellSlots(tokens: readonly Token[], slots: number, flag: (i: number) => string): HTMLElement {
  const row = document.createElement('span');
  row.className = 'spell-slots';
  const n = Math.max(slots, tokens.length);
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    const box = document.createElement('span');
    box.className = 'spell-slot';
    if (!t) {
      box.classList.add('free');
      box.textContent = '·';
    } else {
      box.textContent = t.ch;
      box.style.color = glyphColor(t);
      const f = flag(i);
      if (f) for (const c of f.split(' ')) box.classList.add(c);
      if (i >= slots) box.classList.add('over');
    }
    row.append(box);
  }
  return row;
}

/**
 * Append text to `parent`, drawing `backticked` glyphs (the spell messages'
 * convention) as highlighted glyphs, in their material color where they are one.
 */
export function appendRich(parent: HTMLElement, text: string): void {
  const parts = text.split('`');
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) parent.append(part);
      return;
    }
    const b = document.createElement('b');
    b.className = 'glyph';
    b.textContent = part;
    const m = MATERIALS.find((d) => d.id !== 0 && d.glyph === part);
    if (m) b.style.color = m.color;
    parent.append(b);
  });
}
