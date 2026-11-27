import { MATERIALS } from '../data/materials';
import type { Game } from '../game/game';
import type { Run } from '../game/run';
import { MAT } from '../data/materials';
import { TUTORIAL_HINTS, type TutorialDone } from '../data/tutorial';
import { appendRich, renderSpellSlots } from './spellView';

const BAR_CELLS = 20;
/** Ticks a fizzled glyph flashes red in the wand line. */
const FIZZLE_FLASH_TICKS = 30;
/** Ticks a message stays on screen. */
const MESSAGE_TICKS = 150;
/** Ticks a DISCOVERED banner stays up. */
const DISCOVERY_TICKS = 200;

function bar(value: number, max: number): string {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((value / max) * BAR_CELLS)));
  return '█'.repeat(filled) + '·'.repeat(BAR_CELLS - filled);
}

/**
 * The HUD: HP and mana bars, status tags, the glyph pouch, the wand's spell
 * and recent messages, drawn as text. DOM nodes are only touched when their
 * content changes.
 */
export class Hud {
  private readonly hp: HTMLElement;
  private readonly mana: HTMLElement;
  private readonly status: HTMLElement;
  private readonly pouch: HTMLElement;
  private readonly wand: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly place: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly discover: HTMLElement | null;
  private discoverKey = '';
  private pouchKey = '';
  private wandKey = '';
  private msgKey = '';
  private tipKey = '';

  constructor(root: HTMLElement, tip: HTMLElement, discover: HTMLElement | null = null) {
    this.discover = discover;
    if (discover) discover.hidden = true;
    root.textContent = '';
    this.place = line(root, 'hud-place');
    this.msg = line(root, 'hud-msg');
    this.hp = line(root, 'hud-hp');
    this.mana = line(root, 'hud-mana');
    this.wand = line(root, 'hud-wand');
    this.status = line(root, 'hud-status');
    this.pouch = line(root, 'hud-pouch');
    this.tip = tip;
    tip.hidden = true;
  }

  update(game: Game, run: Run | null = null): void {
    const p = game.player;
    setText(this.place, run ? `${run.place} · seed ${run.seed}` : '');
    const w = game.wand;
    setText(this.hp, `HP ${bar(p.hp, p.maxHp)} ${Math.ceil(p.hp).toString().padStart(3)}`);
    setText(this.mana, `MP ${bar(w.mana, w.stats.maxMana)} ${Math.floor(w.mana).toString().padStart(3)}`);
    this.hp.classList.toggle('hurt', p.hurtThisTick > 0);

    const tags: string[] = [];
    if (p.burning > 0) tags.push('BURNING');
    if (p.scalded > 0) tags.push('SCALDED');
    if (p.buried) tags.push(p.smothered > 0 ? 'BURIED · SUFFOCATING' : 'BURIED');
    if (p.swimming) tags.push('SWIMMING');
    setText(this.status, tags.join('  '));

    this.updateWand(game);
    this.updatePouch(game);
    this.updateMessages(game);
    this.updateTip(game, run);
    this.updateDiscoveries(game);
  }

  /** DISCOVERED / UNLOCKED banners: the latest two, for a few seconds. */
  private updateDiscoveries(game: Game): void {
    const el = this.discover;
    if (!el) return;
    const recent = game.discoveries.filter((d) => game.tick - d.tick < DISCOVERY_TICKS).slice(-2);
    const key = recent.map((d) => d.tick + d.text).join('|');
    if (key === this.discoverKey) return;
    this.discoverKey = key;
    el.hidden = recent.length === 0;
    el.textContent = '';
    for (const d of recent) {
      const row = document.createElement('div');
      row.className = d.title === 'UNLOCKED' ? 'discover-row unlocked' : 'discover-row';
      const t = document.createElement('b');
      t.textContent = d.title;
      const body = document.createElement('span');
      body.textContent = d.text;
      row.append(t, body);
      el.append(row);
    }
  }

  /** The spell in its slots. Matter with no charges is greyed; a fizzle flashes red. */
  private updateWand(game: Game): void {
    // One line per wand; the one in hand is marked. Matter with no charges is greyed; a fizzle flashes red.
    const lines = game.wands.map((w, n) => {
      const spell = w.spell;
      const flags = spell.parse.tokens.map((t) => {
        if (t.kind !== 'matter') return '';
        if (game.tick - (game.caster.fizzledAt[t.material] ?? -1e9) < FIZZLE_FLASH_TICKS) return 'fizzle';
        return game.pouch.count(t.material) === 0 ? 'nocharge' : '';
      });
      const ready = !w.busy && w.mana >= spell.plan.manaCost;
      return { w, n, spell, flags, ready, active: n === game.activeWand };
    });
    const key = lines.map((l) => `${l.active}${l.spell.text}|${l.flags.join(',')}|${l.ready}|${l.w.stats.slots}`).join('/');
    if (key === this.wandKey) return;
    this.wandKey = key;
    this.wand.textContent = '';
    for (const l of lines) {
      const row = document.createElement('div');
      row.className = l.active ? 'hud-wand-row active' : 'hud-wand-row';
      const label = document.createElement('span');
      label.className = 'hud-wand-label';
      label.textContent = game.wands.length > 1 ? `${l.active ? '▸' : ' '}${l.n + 1} ` : 'WAND ';
      const cost = document.createElement('span');
      cost.className = l.ready ? 'hud-wand-cost' : 'hud-wand-cost busy';
      cost.textContent = ` ${l.spell.plan.manaCost} MP`;
      row.append(label, renderSpellSlots(l.spell.parse.tokens, l.w.stats.slots, (i) => l.flags[i] ?? ''), cost);
      if (l.active) {
        const tip = document.createElement('span');
        tip.className = 'hud-wand-tip';
        tip.textContent = game.wands.length > 1 ? '  Tab: edit · 1-3: switch' : '  Tab: edit';
        row.append(tip);
      }
      this.wand.append(row);
    }
  }

  /** One entry per material with charges (or being harvested right now). */
  private updatePouch(game: Game): void {
    const h = game.harvester;
    const entries: { glyph: string; color: string; count: number; full: boolean }[] = [];
    for (const m of MATERIALS) {
      if (m.behavior === 'empty') continue;
      const count = game.pouch.count(m.id);
      const harvesting = h.active && h.material === m.id;
      if (count === 0 && !harvesting) continue;
      entries.push({ glyph: m.glyph, color: m.color, count, full: harvesting && h.full });
    }
    const key = entries.map((e) => `${e.glyph}${e.count}${e.full ? '!' : ''}`).join('|');
    if (key === this.pouchKey) return;
    this.pouchKey = key;
    this.pouch.textContent = '';
    if (entries.length === 0) {
      this.pouch.textContent = 'pouch empty · hold right click to harvest';
      this.pouch.classList.add('empty');
      return;
    }
    this.pouch.classList.remove('empty');
    for (const e of entries) {
      const span = document.createElement('span');
      span.className = 'hud-charge';
      const g = document.createElement('b');
      g.textContent = e.glyph;
      g.style.color = e.color;
      span.append(g, ` ${e.count}${e.full ? ' FULL' : ''}`);
      if (e.full) span.classList.add('full');
      this.pouch.append(span);
    }
  }

  /** The latest couple of messages, for a few seconds. */
  private updateMessages(game: Game): void {
    const recent = game.messages.filter((m) => game.tick - m.tick < MESSAGE_TICKS).slice(-2);
    const key = recent.map((m) => `${m.tick}${m.text}`).join('|');
    if (key === this.msgKey) return;
    this.msgKey = key;
    this.msg.textContent = '';
    for (const m of recent) {
      const d = document.createElement('div');
      d.className = `hud-msg-line ${m.kind}`;
      appendRich(d, m.text);
      this.msg.append(d);
    }
  }

  /** Tutorial: one short hint for the section she's in, until its lesson is done. */
  private updateTip(game: Game, run: Run | null): void {
    let text = '';
    if (run?.mode === 'tutorial' && !game.player.dead) {
      const x = game.player.x;
      const done = (d: TutorialDone | undefined): boolean => {
        switch (d) {
          case 'hasWater':
            return game.pouch.count(MAT.water) > 0;
          case 'hasSand':
            return game.pouch.count(MAT.sand) > 0;
          case 'ventOut':
            return game.features.vents.every((v) => !v.lit);
          case 'chestOpened':
            return game.features.chests.every((c) => c.opened);
          default:
            return false;
        }
      };
      text = TUTORIAL_HINTS.find((h) => x >= h.x0 && x < h.x1 && !done(h.until))?.text ?? '';
    }
    if (text === this.tipKey) return;
    this.tipKey = text;
    this.tip.hidden = text === '';
    this.tip.textContent = '';
    appendRich(this.tip, text);
  }
}

function line(root: HTMLElement, cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  root.append(d);
  return d;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
