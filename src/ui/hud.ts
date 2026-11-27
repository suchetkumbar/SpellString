import { MATERIALS } from '../data/materials';
import type { Game } from '../game/game';
import { appendRich, renderSpellSlots } from './spellView';

const BAR_CELLS = 20;
/** Ticks a fizzled glyph flashes red in the wand line. */
const FIZZLE_FLASH_TICKS = 30;
/** Ticks a message stays on screen. */
const MESSAGE_TICKS = 150;

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
  private readonly death: HTMLElement;
  private pouchKey = '';
  private wandKey = '';
  private msgKey = '';
  private deathKey = '';

  constructor(root: HTMLElement, death: HTMLElement) {
    root.textContent = '';
    this.msg = line(root, 'hud-msg');
    this.hp = line(root, 'hud-hp');
    this.mana = line(root, 'hud-mana');
    this.wand = line(root, 'hud-wand');
    this.status = line(root, 'hud-status');
    this.pouch = line(root, 'hud-pouch');
    this.death = death;
    death.hidden = true;
  }

  update(game: Game): void {
    const p = game.player;
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
    this.updateDeath(game);
  }

  /** The spell in its slots. Matter with no charges is greyed; a fizzle flashes red. */
  private updateWand(game: Game): void {
    const w = game.wand;
    const spell = w.spell;
    const flags = spell.parse.tokens.map((t) => {
      if (t.kind !== 'matter') return '';
      if (game.tick - (game.caster.fizzledAt[t.material] ?? -1e9) < FIZZLE_FLASH_TICKS) return 'fizzle';
      return game.pouch.count(t.material) === 0 ? 'nocharge' : '';
    });
    const ready = !w.busy && w.mana >= spell.plan.manaCost;
    const key = `${spell.text}|${flags.join(',')}|${ready}`;
    if (key === this.wandKey) return;
    this.wandKey = key;
    this.wand.textContent = '';
    const label = document.createElement('span');
    label.className = 'hud-wand-label';
    label.textContent = 'WAND ';
    const cost = document.createElement('span');
    cost.className = ready ? 'hud-wand-cost' : 'hud-wand-cost busy';
    cost.textContent = ` ${spell.plan.manaCost} MP`;
    const tip = document.createElement('span');
    tip.className = 'hud-wand-tip';
    tip.textContent = '  Tab: edit';
    this.wand.append(label, renderSpellSlots(spell.parse.tokens, w.stats.slots, (i) => flags[i] ?? ''), cost, tip);
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

  private updateDeath(game: Game): void {
    const p = game.player;
    const key = p.dead ? `${p.killedBy?.glyph}${p.killedBy?.text}` : '';
    if (key === this.deathKey) return;
    this.deathKey = key;
    this.death.hidden = !p.dead;
    if (!p.dead) return;
    this.death.textContent = '';
    const title = document.createElement('div');
    title.className = 'death-title';
    title.textContent = 'YOU DIED';
    const cause = document.createElement('div');
    cause.textContent = `killed by: ${p.killedBy?.glyph ?? '?'} (${p.killedBy?.text ?? 'unknown'})`;
    const again = document.createElement('div');
    again.className = 'death-again';
    again.textContent = 'press R to try again';
    this.death.append(title, cause, again);
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
