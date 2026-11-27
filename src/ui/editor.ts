import { MATERIALS } from '../data/materials';
import { SPELL_GLYPHS } from '../data/spellGlyphs';
import type { Game } from '../game/game';
import { firstRejected, type CompiledSpell } from '../game/spell/compile';
import { chargesNeeded, cutOffMessage } from '../game/spell/plan';
import { appendRich, renderSpellSlots } from './spellView';

/** Longest draft the editor holds (longer than any wand, so "too long" can be shown). */
const MAX_DRAFT = 32;
/** How long a rejected keystroke's note stays, in ms. */
const REJECT_NOTE_MS = 1800;

const tick = (ch: string): string => `\`${ch}\``;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

/**
 * The spell editor overlay. Tab opens it and pauses the game; you type glyphs
 * straight in (only owned ones are accepted), the cost and errors update as
 * you type, and Enter or Tab writes the spell into the wand. Esc cancels.
 * Copy and paste are the browser's own; pasted glyphs you don't own are
 * highlighted rather than refused.
 */
export class SpellEditor {
  isOpen = false;
  private game: Game | null = null;
  /** A draft that failed to apply, kept for the next open. */
  private pending: string | null = null;
  private readonly input: HTMLInputElement;
  private readonly slots: HTMLElement;
  private readonly info: HTMLElement;
  private readonly problems: HTMLElement;
  private readonly note: HTMLElement;
  private readonly glyphs: HTMLElement;
  private readonly wandLine: HTMLElement;
  private noteTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly onClose: () => void,
  ) {
    root.hidden = true;
    root.textContent = '';
    const title = el('div', 'editor-title', root);
    title.textContent = 'SPELL EDITOR';
    const paused = el('span', 'editor-paused', title);
    paused.textContent = ' · paused';
    this.wandLine = el('div', 'editor-wand', root);
    this.input = el('input', 'editor-input', root);
    this.input.type = 'text';
    this.input.id = 'spell-input';
    this.input.maxLength = MAX_DRAFT;
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', 'Spell');
    this.slots = el('div', 'editor-slots', root);
    this.info = el('div', 'editor-info', root);
    this.problems = el('div', 'editor-problems', root);
    this.note = el('div', 'editor-note', root);
    this.glyphs = el('div', 'editor-glyphs', root);
    const help = el('div', 'editor-help', root);
    help.textContent = 'type glyphs · Enter or Tab: write to wand · Esc: cancel · Ctrl+C / Ctrl+V to share spells';

    this.input.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    // Paste is handled here: newlines become spaces, and missing glyphs stay (highlighted) instead of being refused.
    this.input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text/plain');
      if (text === undefined) return;
      e.preventDefault();
      this.insert(text.replace(/[\r\n\t]+/g, ' '));
    });
    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(false);
      }
    });
    // Keep typing focus while the editor is open (clicks on the glyph list insert, not blur).
    this.input.addEventListener('blur', () => {
      if (this.isOpen) setTimeout(() => this.isOpen && this.input.focus(), 0);
    });
  }

  open(game: Game): void {
    this.game = game;
    this.isOpen = true;
    this.root.hidden = false;
    this.input.value = this.pending ?? game.wand.spell.text;
    this.pending = null;
    this.showNote('');
    this.refresh();
    this.input.focus();
    // Selected, so typing replaces the spell at once; arrows keep and edit it.
    this.input.select();
  }

  /** Close; with `apply`, write the draft into the wand if it compiles. */
  close(apply: boolean): void {
    if (!this.isOpen) return;
    const game = this.game;
    if (apply && game) {
      const text = this.input.value;
      if (text !== game.wand.spell.text) {
        const c = game.wand.write(text, game.owns);
        if (c.ok) {
          game.say(`Wand: ${c.text.replace(/\s+/g, '')}`, 'info');
        } else {
          this.pending = text;
          game.say(`Spell not written: ${c.parse.errors[0]?.message ?? 'nothing to cast.'}`, 'warn');
        }
      }
    }
    this.isOpen = false;
    this.root.hidden = true;
    this.input.blur();
    this.onClose();
  }

  private onBeforeInput(e: InputEvent): void {
    const game = this.game;
    if (!game) return;
    // Typing only accepts owned glyphs. Paste and drop go through; missing glyphs get highlighted.
    if (!e.inputType.startsWith('insert') || e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') return;
    const typed = e.data ?? '';
    const bad = firstRejected(typed, game.owns);
    if (bad !== null) {
      e.preventDefault();
      const m = MATERIALS.find((d) => d.glyph === bad && d.id !== 0);
      this.showNote(
        m ? `You have never collected ${tick(bad)} (${m.name}): harvest some first.` : `${tick(bad)} isn't a glyph you know.`,
      );
    }
  }

  /** Insert text at the caret (glyph list clicks and paste), up to the draft limit. */
  private insert(text: string): void {
    const i = this.input;
    const start = i.selectionStart ?? i.value.length;
    const end = i.selectionEnd ?? start;
    const room = MAX_DRAFT - (i.value.length - (end - start));
    if (room <= 0) return;
    i.setRangeText([...text].slice(0, room).join(''), start, end, 'end');
    i.focus();
    this.refresh();
  }

  private showNote(text: string): void {
    this.note.textContent = '';
    appendRich(this.note, text);
    window.clearTimeout(this.noteTimer);
    if (text) this.noteTimer = window.setTimeout(() => (this.note.textContent = ''), REJECT_NOTE_MS);
  }

  /** Re-analyze the draft: slots, cost, errors, warnings and the glyph list. */
  private refresh(): void {
    const game = this.game;
    if (!game) return;
    const w = game.wand;
    const draft = this.input.value;
    const c: CompiledSpell = w.compile(draft, game.owns);
    const s = w.stats;

    this.wandLine.textContent = `wand: ${s.slots} slots · ${s.maxMana} MP (${Math.floor(w.mana)} now) · cast delay ${(s.castDelayTicks / 60).toFixed(2)} s · recharge ${(s.rechargeTicks / 60).toFixed(2)} s`;

    // Slots, with errors and missing or empty glyphs marked.
    const errorAt = new Set(c.parse.errors.map((e) => e.pos));
    const flags = c.parse.tokens.map((t) => {
      const f: string[] = [];
      if (errorAt.has(t.pos)) f.push('error');
      if (t.kind === 'unknown' || !game.owns(t.ch)) f.push('missing');
      else if (t.kind === 'matter' && game.pouch.count(t.material) === 0) f.push('nocharge');
      return f.join(' ');
    });
    this.slots.textContent = '';
    this.slots.append(renderSpellSlots(c.parse.tokens, s.slots, (i) => flags[i] ?? ''));
    const used = el('span', 'editor-used', this.slots);
    used.textContent = ` ${c.parse.slotsUsed}/${s.slots}`;
    used.classList.toggle('over', c.parse.slotsUsed > s.slots);

    // Cost and what it does.
    const p = c.plan;
    this.info.textContent = '';
    const cost = el('span', 'editor-cost', this.info);
    cost.textContent = `cost ${p.manaCost} MP`;
    cost.classList.toggle('over', p.manaCost > s.maxMana);
    if (p.casts.length > 0) {
      const what = el('span', 'editor-what', this.info);
      const kinds = p.casts.reduce((n, k) => n + k.carriers, 0);
      what.textContent = ` · ${p.casts.length} cast${p.casts.length === 1 ? '' : 's'}, ${kinds} carrier${kinds === 1 ? '' : 's'}${p.cells ? `, ${p.cells} cells` : ' (kinetic)'}`;
      const need = chargesNeeded(p);
      if (need.size > 0) {
        const uses = el('span', 'editor-uses', this.info);
        uses.append(' · uses ');
        for (const [m, n] of need) {
          const have = game.pouch.count(m);
          const b = el('b', have >= n ? 'have' : 'short', uses);
          b.textContent = `${MATERIALS[m]?.glyph ?? '?'}${n}`;
          b.style.color = MATERIALS[m]?.color ?? '';
          b.title = `${have} in the pouch`;
          uses.append(' ');
        }
      }
    }

    // Errors first, then warnings.
    this.problems.textContent = '';
    for (const e of c.parse.errors.slice(0, 3)) {
      const d = el('div', 'editor-error', this.problems);
      appendRich(d, e.pos >= 0 ? `col ${e.pos + 1}: ${e.message}` : e.message);
    }
    if (c.parse.errors.length === 0) {
      const warn = (text: string): void => {
        appendRich(el('div', 'editor-warn', this.problems), text);
      };
      for (const [m, n] of chargesNeeded(p)) {
        const have = game.pouch.count(m);
        if (have < n) warn(`${have === 0 ? 'No' : `Only ${have}`} ${tick(MATERIALS[m]?.glyph ?? '?')} charges: ${have === 0 ? 'it' : 'some'} will fizzle.`);
      }
      if (p.cutOff) warn(cutOffMessage(p.cutOff));
      if (p.manaCost > s.maxMana) warn(`Costs more than this wand's ${s.maxMana} MP: it can never fire.`);
      if (c.ok && this.problems.childElementCount === 0) {
        el('div', 'editor-ok', this.problems).textContent = draft === w.spell.text ? 'in the wand' : 'ready: Enter to write it';
      }
    }

    this.renderGlyphs(game);
  }

  /** Owned glyphs, clickable: deliveries, modifiers, then matter with charges. */
  private renderGlyphs(game: Game): void {
    this.glyphs.textContent = '';
    const add = (glyph: string, label: string, color: string, extra = ''): void => {
      const b = el('button', 'editor-glyph', this.glyphs);
      b.type = 'button';
      b.tabIndex = -1;
      const g = el('b', '', b);
      g.textContent = glyph;
      g.style.color = color;
      b.append(` ${label}`);
      if (extra) b.classList.add(extra);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep the caret in the input
        this.insert(glyph);
      });
    };
    for (const g of SPELL_GLYPHS) {
      if (g.kind === 'digit' || !game.owns(g.glyph)) continue;
      add(g.glyph, g.name, '#f6f0ff');
    }
    add('3', 'repeat 2-9', '#a9b1c4');
    for (const m of MATERIALS) {
      if (m.id === 0 || !game.owns(m.glyph)) continue;
      const n = game.pouch.count(m.id);
      add(m.glyph, `${m.name} ${n}`, m.color, n === 0 ? 'nocharge' : '');
    }
  }
}
