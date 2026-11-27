import { TUNING } from '../data/tuning';
import type { Run } from '../game/run';
import { appendRich } from './spellView';

export type ScreenKind = 'title' | 'pause' | 'shrine' | 'death' | 'won';

export interface ScreenActions {
  /** A descent; `seedText` may be blank (random). */
  newRun(seedText: string): void;
  daily(): void;
  tutorial(): void;
  lab(): void;
  resume(): void;
  /** Start over the same kind of run (a new seed for random runs). */
  again(): void;
  quit(): void;
  choose(index: number): void;
  /** Leave the shrine. */
  descend(): void;
}

export interface TitleInfo {
  readonly dailyDate: string;
  readonly dailySeed: number;
}

/** The title, set in glyphs: each letter tinted like a material. */
const LOGO: readonly (readonly [string, string])[] = [
  ['S', '#d9b56c'], ['P', '#3d8bfd'], ['E', '#ffd23f'], ['L', '#8a4f8e'], ['L', '#8b5a2b'], ['S', '#cfd8e3'],
  ['T', '#ff9a1f'], ['R', '#5a6170'], ['I', '#c792ea'], ['N', '#3d8bfd'], ['G', '#d9b56c'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
}

/**
 * Full-screen menus over the game: title, pause, Glyph Shrine, death (with the
 * copyable run postcard) and the end of the descent. Keyboard first (keys are
 * handled in main.ts and shown in [brackets]); every option is also clickable.
 */
export class Screens {
  current: ScreenKind | null = null;
  private key = '';
  /** The title's seed field. */
  seedField: HTMLInputElement | null = null;
  /** The postcard text on the death/won screens. */
  postcard = '';
  private copied: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: ScreenActions,
    private readonly title: TitleInfo,
  ) {
    root.hidden = true;
  }

  show(kind: ScreenKind | null, run: Run | null): void {
    const key = `${kind}|${run?.seed}|${run?.depth}|${run?.phase}|${run?.shrinePicks}|${run?.offers.length}|${run?.gold}`;
    if (key === this.key) return;
    this.key = key;
    this.current = kind;
    this.root.hidden = kind === null;
    this.root.className = `overlay screen${kind ? ` screen-is-${kind}` : ''}`;
    this.root.textContent = '';
    this.seedField = null;
    if (!kind) return;
    switch (kind) {
      case 'title':
        return this.buildTitle();
      case 'pause':
        return this.buildPause(run!);
      case 'shrine':
        return this.buildShrine(run!);
      case 'death':
      case 'won':
        return this.buildEnd(kind, run!);
    }
  }

  /** Copy the postcard (and say so). */
  copy(): void {
    const done = (): void => {
      if (this.copied) this.copied.textContent = 'copied';
    };
    navigator.clipboard?.writeText(this.postcard).then(done, () => {
      const ta = this.root.querySelector('textarea');
      ta?.select();
    });
  }

  private button(parent: HTMLElement, key: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'screen-button', parent);
    b.type = 'button';
    el('b', 'screen-key', b, `[${key}]`);
    b.append(` ${label}`);
    b.addEventListener('click', onClick);
    return b;
  }

  private buildTitle(): void {
    const r = this.root;
    const logo = el('div', 'screen-logo', r);
    for (const [ch, color] of LOGO) el('span', '', logo, ch).style.color = color;
    el('div', 'screen-sub', r, "a glyph-witch's descent");
    const menu = el('div', 'screen-menu', r);
    const row = el('div', 'screen-row', menu);
    this.button(row, 'Enter', 'new run', () => this.actions.newRun(this.seedField?.value ?? ''));
    const seed = el('input', 'screen-seed', row);
    seed.placeholder = 'seed (optional)';
    seed.spellcheck = false;
    seed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.actions.newRun(seed.value);
      }
    });
    this.seedField = seed;
    this.button(menu, 'D', `daily run · ${this.title.dailyDate} · seed ${this.title.dailySeed}`, () => this.actions.daily());
    this.button(menu, 'T', 'tutorial', () => this.actions.tutorial());
    this.button(menu, 'L', 'lab: paint materials, every glyph', () => this.actions.lab());
    el('div', 'screen-help', r, 'A/D move · W jump · left click cast · right click harvest · Tab spell editor · Esc pause');
  }

  private buildPause(run: Run): void {
    const r = this.root;
    el('div', 'screen-title', r, 'PAUSED');
    el('div', 'screen-sub', r, `${run.place} · seed ${run.seed}${run.label ? ` · ${run.label}` : ''}`);
    const menu = el('div', 'screen-menu', r);
    this.button(menu, 'Esc', 'resume', () => this.actions.resume());
    this.button(menu, 'R', 'restart run', () => this.actions.again());
    this.button(menu, 'Q', 'quit to title', () => this.actions.quit());
  }

  private buildShrine(run: Run): void {
    const r = this.root;
    el('div', 'screen-title shrine', r, 'GLYPH SHRINE');
    const cost = run.giftCost;
    el(
      'div',
      'screen-sub',
      r,
      cost === 0
        ? `You rest a moment (+${TUNING.shrineHeal} HP). Take a gift down to level ${run.depth + 1}.`
        : `Another gift costs ${cost} gold. You have ${run.gold}.`,
    );
    const cards = el('div', 'shrine-cards', r);
    const kindText = { glyph: 'new glyph', wand: 'wand', newWand: 'new wand' } as const;
    run.offers.forEach((o, i) => {
      const card = el('button', `shrine-card ${o.kind}${run.gold < cost ? ' cant' : ''}`, cards);
      card.type = 'button';
      el('div', 'shrine-key', card, cost > 0 ? `[${i + 1}]  ${cost} $` : `[${i + 1}]`);
      el('div', 'shrine-name', card, o.title);
      el('div', 'shrine-text', card, `${kindText[o.kind]}: ${o.text}`);
      card.addEventListener('click', () => this.actions.choose(i));
    });
    const menu = el('div', 'screen-menu', r);
    if (run.shrinePicks > 0) this.button(menu, 'Enter', 'descend', () => this.actions.descend());
    el('div', 'screen-help', r, `the first gift is free; more cost ${TUNING.shrineExtraCost} gold each · gold: ${run.gold}`);
  }

  private buildEnd(kind: 'death' | 'won', run: Run): void {
    const r = this.root;
    const won = kind === 'won';
    if (won) {
      el('div', 'screen-title won', r, run.mode === 'tutorial' ? 'TUTORIAL COMPLETE' : 'THE DESCENT GOES ON');
      el('div', 'screen-sub', r, run.mode === 'tutorial' ? 'You know enough to go down.' : 'You reached the deepest level built so far.');
    } else {
      el('div', 'screen-title dead', r, 'YOU DIED');
      const p = run.game.player;
      const cause = el('div', 'screen-sub', r);
      appendRich(cause, `killed by: \`${p.killedBy?.glyph ?? '?'}\` (${p.killedBy?.text ?? 'unknown'})`);
    }
    this.postcard = run.postcard();
    const card = el('textarea', 'postcard', r);
    card.readOnly = true;
    card.value = this.postcard;
    card.rows = 3;
    card.spellcheck = false;
    const menu = el('div', 'screen-menu', r);
    const again = run.mode === 'tutorial' && won ? 'start a run' : 'new run';
    this.button(menu, 'R', again, () => (run.mode === 'tutorial' && won ? this.actions.newRun('') : this.actions.again()));
    const copy = this.button(menu, 'C', 'copy postcard', () => this.copy());
    this.copied = el('span', 'screen-copied', copy);
    this.button(menu, 'Esc', 'title', () => this.actions.quit());
  }
}
