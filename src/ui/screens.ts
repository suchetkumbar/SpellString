import { TUNING } from '../data/tuning';
import type { Run } from '../game/run';
import { CODEX_ENTRIES, entryText, type Codex } from '../game/codex';
import { UNLOCKS, type DiscoveryKind } from '../data/unlocks';
import { appendRich } from './spellView';
import type { Settings, SettingsData } from '../game/settings';
import { REMAPPABLE, type Action } from '../data/controls';

export type ScreenKind = 'title' | 'pause' | 'shrine' | 'death' | 'won' | 'codex' | 'settings';

export interface ScreenActions {
  /** A descent; `seedText` may be blank (random). */
  newRun(seedText: string): void;
  daily(): void;
  tutorial(): void;
  lab(): void;
  /** Open the Codex (Esc returns). */
  codex(): void;
  closeCodex(): void;
  /** Open / close the settings screen. */
  settings(): void;
  closeSettings(): void;
  /** Pick the next unlocked starting wand. */
  cycleWand(): void;
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
  /** Bumped when the settings screen must redraw (a value changed). */
  private revision = 0;
  /** The action waiting for a key press to rebind, if any. */
  rebinding: Action | null = null;

  /** Redraw the current screen on the next show(). */
  invalidate(): void {
    this.revision++;
  }

  /** Settings: toggles, volume steps and key rebinding (mouse; Esc goes back). */
  private buildSettings(): void {
    const r = this.root;
    const p = this.prefs;
    const d = p.data;
    el('div', 'screen-title', r, 'SETTINGS');
    const panel = el('div', 'codex-panel settings-panel', r);
    const row = (label: string): HTMLElement => {
      const line = el('div', 'settings-row', panel);
      el('span', 'settings-label', line, label);
      return line;
    };
    const set = (patch: Partial<SettingsData>): void => {
      p.update(patch);
      this.invalidate();
    };
    const volume = (label: string, key: 'masterVolume' | 'sfxVolume' | 'ambientVolume'): void => {
      const line = row(label);
      const v = d[key];
      const minus = el('button', 'screen-button', line, '−');
      el('span', 'settings-value', line, `${'█'.repeat(Math.round(v * 10))}${'·'.repeat(10 - Math.round(v * 10))} ${Math.round(v * 100)}%`);
      const plus = el('button', 'screen-button', line, '+');
      minus.addEventListener('click', () => set({ [key]: Math.max(0, Math.round((v - 0.1) * 10) / 10) }));
      plus.addEventListener('click', () => set({ [key]: Math.min(1, Math.round((v + 0.1) * 10) / 10) }));
    };
    const toggle = (label: string, key: 'shake' | 'hitStop' | 'crt' | 'glow' | 'highContrast' | 'reduceFlashing'): void => {
      const line = row(label);
      const b = el('button', `screen-button settings-toggle${d[key] ? ' on' : ''}`, line, d[key] ? '[x] on' : '[ ] off');
      b.dataset.setting = key;
      b.addEventListener('click', () => set({ [key]: !d[key] }));
    };
    el('div', 'codex-section', panel, 'Sound');
    volume('master volume', 'masterVolume');
    volume('effects', 'sfxVolume');
    volume('ambience', 'ambientVolume');
    el('div', 'codex-section', panel, 'Screen');
    toggle('screen shake', 'shake');
    toggle('hit-stop', 'hitStop');
    toggle('CRT + bloom (WebGL)', 'crt');
    toggle('glow on fire and acid', 'glow');
    toggle('high-contrast palette', 'highContrast');
    toggle('reduce flashing', 'reduceFlashing');
    el('div', 'codex-section', panel, 'Keys (click to rebind, then press a key)');
    for (const [action, label] of REMAPPABLE) {
      const line = row(label);
      const keys = p.keysFor(action).filter((c) => !c.startsWith('Pad'));
      const b = el('button', 'screen-button settings-key', line, this.rebinding === action ? 'press a key…' : keys.join(' / ') || '(none)');
      b.addEventListener('click', () => this.startRebind(action));
    }
    const reset = el('button', 'screen-button', panel, 'reset keys to defaults');
    reset.addEventListener('click', () => {
      p.resetKeys();
      this.invalidate();
    });
    el('div', 'screen-help', r, 'gamepad: left stick moves · right stick aims · A jump · RT cast · LT harvest · X/Y/B wands · Start pause');
    const menu = el('div', 'screen-menu', r);
    this.button(menu, 'Esc', 'back', () => this.actions.closeSettings());
  }

  /** Wait for the next key press and bind it to `action` (Esc cancels). The game never sees that key. */
  private startRebind(action: Action): void {
    this.rebinding = action;
    this.invalidate();
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', onKey, true);
      if (e.code !== 'Escape') this.prefs.rebind(action, e.code);
      this.rebinding = null;
      this.invalidate();
    };
    window.addEventListener('keydown', onKey, true);
  }
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
    private readonly book: Codex,
    private readonly prefs: Settings,
  ) {
    root.hidden = true;
  }

  show(kind: ScreenKind | null, run: Run | null): void {
    const key = `${kind}|${run?.seed}|${run?.depth}|${run?.phase}|${run?.shrinePicks}|${run?.offers.length}|${run?.gold}|${this.book.startingWand.id}|${this.book.runCount}|${this.revision}`;
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
      case 'settings':
        return this.buildSettings();
      case 'codex':
        return this.buildCodex();
    }
  }

  /** The Reaction Codex: everything discovered (and what's still missing), unlocks, and the spell journal. */
  private buildCodex(): void {
    const r = this.root;
    const b = this.book;
    el('div', 'screen-title', r, 'REACTION CODEX');
    el('div', 'screen-sub', r, `${b.runCount} run${b.runCount === 1 ? '' : 's'} recorded`);
    const panel = el('div', 'codex-panel', r);
    const sections: [DiscoveryKind, string][] = [
      ['reaction', 'Reactions'],
      ['material', 'Materials'],
      ['creature', 'Creatures'],
      ['glyph', 'Glyphs'],
    ];
    for (const [kind, label] of sections) {
      const all = CODEX_ENTRIES[kind];
      el('div', 'codex-section', panel, `${label}  ${b.count(kind)}/${all.length}`);
      const grid = el('div', 'codex-grid', panel);
      for (const id of all) {
        const known = b.has(kind, id);
        const entry = el('div', known ? 'codex-entry' : 'codex-entry unknown', grid);
        entry.textContent = known ? entryText(kind, id) : '???';
      }
    }
    el('div', 'codex-section', panel, `Unlocks  ${b.unlocked().length}/${UNLOCKS.length}`);
    for (const u of UNLOCKS) {
      const open = b.meets(u);
      el('div', `codex-unlock ${open ? 'open' : 'closed'}`, panel, open ? `✓ ${u.title}: ${u.text}` : `○ ${u.title}: ${u.hint}`);
    }
    el('div', 'codex-section', panel, 'Spell journal: most cast');
    const top = b.topSpells();
    const spells = el('div', 'codex-grid', panel);
    if (top.length === 0) el('div', 'codex-entry unknown', spells, 'nothing cast yet');
    for (const s of top) el('div', 'codex-entry', spells, `${s.spell}  ×${s.casts}`);
    el('div', 'codex-section', panel, 'Recent runs');
    const runs = b.recentRuns().slice(0, 8);
    if (runs.length === 0) el('div', 'codex-run', panel, 'no runs yet');
    for (const x of runs) {
      el('div', 'codex-run', panel, `seed ${x.seed}${x.date ? ` (${x.date})` : ''} · depth ${x.depth}/${x.totalLevels} · ${x.ending} · wand: ${x.spell}${x.best ? ` · best: ${x.best}` : ''}`);
    }
    const menu = el('div', 'screen-menu', r);
    this.button(menu, 'Esc', 'back', () => this.actions.closeCodex());
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
    this.button(menu, 'L', 'lab: paint materials with every glyph you know', () => this.actions.lab());
    this.button(menu, 'C', `codex · ${this.book.count('reaction')}/${CODEX_ENTRIES.reaction.length} reactions · ${this.book.unlocked().length}/${UNLOCKS.length} unlocks`, () => this.actions.codex());
    const wands = this.book.startingWands();
    this.button(menu, 'S', 'settings', () => this.actions.settings());
    if (wands.length > 1) this.button(menu, 'W', `starting wand: ${this.book.startingWand.name}`, () => this.actions.cycleWand());
    el('div', 'screen-help', r, 'A/D move · W jump · left click cast · right click harvest · Tab spell editor · Esc pause');
  }

  private buildPause(run: Run): void {
    const r = this.root;
    el('div', 'screen-title', r, 'PAUSED');
    el('div', 'screen-sub', r, `${run.place} · seed ${run.seed}${run.label ? ` · ${run.label}` : ''}`);
    const menu = el('div', 'screen-menu', r);
    this.button(menu, 'Esc', 'resume', () => this.actions.resume());
    this.button(menu, 'R', 'restart run', () => this.actions.again());
    this.button(menu, 'C', 'codex', () => this.actions.codex());
    this.button(menu, 'S', 'settings', () => this.actions.settings());
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
