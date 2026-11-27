import { MATERIALS } from '../data/materials';
import type { Game } from '../game/game';

const BAR_CELLS = 20;

function bar(value: number, max: number): string {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((value / max) * BAR_CELLS)));
  return '█'.repeat(filled) + '·'.repeat(BAR_CELLS - filled);
}

/**
 * The HUD: HP and mana bars, status tags and the glyph pouch, drawn as text.
 * DOM nodes are only touched when their text changes.
 */
export class Hud {
  private readonly hp: HTMLElement;
  private readonly mana: HTMLElement;
  private readonly status: HTMLElement;
  private readonly pouch: HTMLElement;
  private readonly death: HTMLElement;
  private pouchKey = '';
  private deathKey = '';

  constructor(root: HTMLElement, death: HTMLElement) {
    root.textContent = '';
    this.hp = line(root, 'hud-hp');
    this.mana = line(root, 'hud-mana');
    this.status = line(root, 'hud-status');
    this.pouch = line(root, 'hud-pouch');
    this.death = death;
    death.hidden = true;
  }

  update(game: Game): void {
    const p = game.player;
    setText(this.hp, `HP ${bar(p.hp, p.maxHp)} ${Math.ceil(p.hp).toString().padStart(3)}`);
    setText(this.mana, `MP ${bar(p.mana, p.maxMana)} ${Math.floor(p.mana).toString().padStart(3)}`);
    this.hp.classList.toggle('hurt', p.hurtThisTick > 0);

    const tags: string[] = [];
    if (p.burning > 0) tags.push('BURNING');
    if (p.scalded > 0) tags.push('SCALDED');
    if (p.buried) tags.push(p.smothered > 0 ? 'BURIED · SUFFOCATING' : 'BURIED');
    if (p.swimming) tags.push('SWIMMING');
    setText(this.status, tags.join('  '));

    // Pouch: one entry per material with charges (or being harvested right now).
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
    if (key !== this.pouchKey) {
      this.pouchKey = key;
      this.pouch.textContent = '';
      if (entries.length === 0) {
        this.pouch.textContent = 'pouch empty · hold right click to harvest';
        this.pouch.classList.add('empty');
      } else {
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
    }

    // Death card.
    const deathKey = p.dead ? `${p.killedBy?.glyph}${p.killedBy?.text}` : '';
    if (deathKey !== this.deathKey) {
      this.deathKey = deathKey;
      this.death.hidden = !p.dead;
      if (p.dead) {
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
