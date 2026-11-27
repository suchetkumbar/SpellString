import { MATERIALS, type MaterialKey } from '../data/materials';
import type { Action } from '../data/controls';
import type { Settings } from '../game/settings';

/**
 * The how-to-play guide: the game's loop (harvest, write, cast, react) told
 * with the game's own glyphs, then the controls as keycaps (from the player's
 * current bindings), the spell glyphs, and the gamepad. Opens when the game
 * starts (unless turned off) and from anywhere with H.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
}

const color = (k: MaterialKey): string => MATERIALS.find((m) => m.key === k)?.color ?? '#cfd8e3';

/** A material glyph in its own color. */
function glyphs(parent: HTMLElement, text: string, k: MaterialKey): void {
  el('span', 'guide-mat', parent, text).style.color = color(k);
}

/** "KeyA" -> "A", "ArrowLeft" -> "←", "Digit1" -> "1"... */
export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Equal: '+', Minus: '−',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadEnter: 'Num Enter',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', BracketLeft: '[', BracketRight: ']',
    Slash: '/', Backquote: '`', Comma: ',', Period: '.', Semicolon: ';', Quote: "'",
  };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

function keycap(parent: HTMLElement, label: string, wide = false): void {
  el('kbd', wide ? 'guide-key wide' : 'guide-key', parent, label);
}

export interface GuideOptions {
  readonly prefs: Settings;
  /** Opened over a run (vs. the title): changes the close label. */
  readonly inGame: boolean;
  readonly close: () => void;
  /** After a setting changed: rebuild. */
  readonly changed: () => void;
}

export function buildGuide(root: HTMLElement, o: GuideOptions): void {
  const keys = (a: Action, max = 2): string[] => o.prefs.keysFor(a).filter((c) => !c.startsWith('Pad')).slice(0, max).map(keyLabel);
  const g = el('div', 'guide', root);
  g.setAttribute('role', 'dialog');
  g.setAttribute('aria-label', 'How to play');
  el('div', 'screen-title', g, 'HOW TO PLAY');
  el('p', 'guide-lede', g, 'Every character in this world is matter. Pull it into your pouch, write it into your wand, and throw it back.');

  // The loop, in order.
  const loop = el('ol', 'guide-loop', g);
  const step = (i: number, verb: string, art: (a: HTMLElement) => void, how: (h: HTMLElement) => void): void => {
    const li = el('li', 'guide-step', loop);
    li.style.setProperty('--i', String(i));
    art(el('div', 'guide-art', li));
    el('div', 'guide-verb', li, verb);
    how(el('div', 'guide-how', li));
  };
  step(
    0,
    'Harvest',
    (a) => {
      glyphs(a, '~~~', 'water');
      glyphs(a, '^^', 'fire');
    },
    (h) => {
      keycap(h, 'right click', true);
      h.append(' and hold on matter. Each glyph you gather is a charge.');
    },
  );
  step(
    1,
    'Write',
    (a) => {
      const slots = el('span', 'guide-slots', a);
      el('span', 'spell-slot', slots, '>');
      el('span', 'spell-slot', slots, '~').style.color = color('water');
      el('span', 'spell-slot', slots, '^').style.color = color('fire');
    },
    (h) => {
      for (const k of keys('editor', 1)) keycap(h, k);
      h.append(' opens your wand. Type a spell, then ');
      keycap(h, 'Enter');
      h.append('.');
    },
  );
  step(
    2,
    'Cast',
    (a) => {
      el('span', 'guide-witch', a, '@');
      el('span', 'guide-trail', a, '· ·');
      el('span', 'guide-bolt', a, '>');
    },
    (h) => {
      keycap(h, 'left click', true);
      h.append(' fires it at the cursor. Hold to keep casting.');
    },
  );
  step(
    3,
    'React',
    (a) => glyphs(a, '" " "', 'steam'),
    (h) => {
      h.append('Water meets fire and turns to scalding steam. Find out what else reacts.');
    },
  );

  // Controls, grouped by what they're for.
  const cols = el('div', 'guide-cols', g);
  const group = (title: string, rows: [string[], string][]): void => {
    const s = el('section', 'guide-group', cols);
    el('h3', 'guide-h', s, title);
    for (const [caps, what] of rows) {
      const r = el('div', 'guide-row', s);
      const c = el('span', 'guide-caps', r);
      for (const k of caps) keycap(c, k, k.length > 3);
      el('span', 'guide-what', r, what);
    }
  };
  group('Moving', [
    [[...keys('left', 1), ...keys('right', 1)], 'walk'],
    [keys('jump'), 'jump, swim up'],
    [keys('down', 1), 'swim down'],
    [[...keys('zoomIn', 1), ...keys('zoomOut', 1)], 'zoom'],
  ]);
  group('Your wands', [
    [[...keys('wand1', 1), ...keys('wand2', 1), ...keys('wand3', 1)], 'switch wand'],
    [keys('editor', 1), 'write a spell (pauses)'],
    [['left click'], 'cast'],
    [['right click'], 'harvest'],
  ]);
  group('Any time', [
    [keys('guide'), 'this guide'],
    [keys('pause', 1), 'pause, codex, settings'],
    [keys('restart', 1), 'try again after dying'],
  ]);

  // The spell language, as a glossary.
  const gram = el('section', 'guide-grammar', g);
  el('h3', 'guide-h', gram, 'Spell glyphs');
  const list = el('dl', 'guide-glyphs', gram);
  const glossary: [string, string][] = [
    ['>', 'bolt'],
    [')', 'lob'],
    ['@', 'burst around you'],
    ['_', 'mine'],
    ['+', 'split in three'],
    ['2–9', 'repeat'],
    ['!', 'trigger: cast the rest on impact'],
    ['?', 'random matter'],
    ['[ ]n', 'loop n times'],
  ];
  for (const [glyph, meaning] of glossary) {
    const d = el('div', 'guide-pair', list);
    el('dt', '', d, glyph);
    el('dd', '', d, meaning);
  }
  el('p', 'guide-note', gram, 'A spell is read left to right: a delivery, then the matter it carries. You can only write glyphs you have found.');

  el('p', 'guide-pad', g, 'Gamepad: left stick moves, right stick aims, A jumps, RT casts, LT harvests, X / Y / B switch wands, Start pauses.');

  const foot = el('div', 'guide-foot', g);
  const close = el('button', 'screen-button', foot);
  close.type = 'button';
  el('b', 'screen-key', close, `[${keyLabel(o.prefs.keysFor('pause')[0] ?? 'Escape')}]`);
  close.append(o.inGame ? ' back to the game' : ' back to the menu');
  close.addEventListener('click', o.close);
  const on = o.prefs.data.guideAtStart;
  const t = el('button', `screen-button settings-toggle guide-toggle${on ? ' on' : ''}`, foot, `${on ? '[x]' : '[ ]'} show this guide when the game starts`);
  t.type = 'button';
  t.addEventListener('click', () => {
    o.prefs.update({ guideAtStart: !o.prefs.data.guideAtStart });
    o.changed();
  });
}
