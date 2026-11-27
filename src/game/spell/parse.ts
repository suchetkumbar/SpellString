import { MATERIAL_BY_GLYPH } from '../../data/materials';
import { SPELL_GLYPH_BY_CHAR } from '../../data/spellGlyphs';

/**
 * Spell tokenizer and parser. Grammar (SPELLSTRING.md section 6):
 *
 *   spell    := group+
 *   group    := cast | loop
 *   loop     := '[' group+ ']' count
 *   cast     := '+'* delivery payload trigger?
 *   trigger  := '!' group+          // inside a loop, stops at the matching ']'
 *   payload  := ( matter count? | '?' )*
 *   delivery := '>' | ')' | '@' | '_'
 *   count    := '2'..'9'
 *
 * Every non-space character takes one wand slot. The parser never throws: all
 * problems come back as friendly errors pointing at the character at fault.
 */

export type Delivery = '>' | ')' | '@' | '_';

export type TokenKind = 'delivery' | 'matter' | 'split' | 'digit' | 'trigger' | 'chaos' | 'open' | 'close' | 'unknown';

export interface Token {
  readonly kind: TokenKind;
  readonly ch: string;
  /** Index into the original text (spaces included), for pointing at errors. */
  readonly pos: number;
  /** Wand slot this character occupies (spaces take none). */
  readonly slot: number;
  /** Material id for matter tokens, else 0. */
  readonly material: number;
  /** Value for digit tokens, else 0. */
  readonly digit: number;
}

export interface MatterItem {
  readonly kind: 'matter';
  readonly material: number;
  count: number;
  readonly pos: number;
}

export interface ChaosItem {
  readonly kind: 'chaos';
  readonly pos: number;
}

export type PayloadItem = MatterItem | ChaosItem;

export interface CastNode {
  readonly kind: 'cast';
  /** Position of the delivery glyph. */
  readonly pos: number;
  /** Number of `+` before the delivery. */
  readonly split: number;
  readonly delivery: Delivery;
  readonly payload: readonly PayloadItem[];
  /** Casts fired from the impact point (`!`), or null. */
  readonly trigger: readonly Group[] | null;
}

export interface LoopNode {
  readonly kind: 'loop';
  readonly pos: number;
  readonly body: readonly Group[];
  readonly count: number;
}

export type Group = CastNode | LoopNode;

export type SpellErrorCode =
  | 'empty'
  | 'matterFirst'
  | 'unknownGlyph'
  | 'unownedGlyph'
  | 'triggerEmpty'
  | 'triggerPlace'
  | 'unclosedLoop'
  | 'unmatchedClose'
  | 'loopCount'
  | 'emptyLoop'
  | 'digitPlace'
  | 'splitPlace'
  | 'tooLong';

export interface SpellError {
  readonly code: SpellErrorCode;
  /** Index into the original text of the character at fault, or -1 for the whole spell. */
  readonly pos: number;
  readonly message: string;
}

export interface ParseOptions {
  /** Is this glyph owned? Unowned glyphs are errors. Omit to own everything. */
  readonly owns?: (ch: string) => boolean;
  /** Wand slot count. Omit for no limit. */
  readonly slots?: number;
}

export interface ParseResult {
  readonly tokens: readonly Token[];
  readonly groups: readonly Group[];
  /** Sorted by position. Empty means the spell is valid. */
  readonly errors: readonly SpellError[];
  /** Slots used (non-space characters). */
  readonly slotsUsed: number;
}

const DELIVERIES: ReadonlySet<string> = new Set(['>', ')', '@', '_']);

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function classify(ch: string, pos: number, slot: number): Token {
  const base = { ch, pos, slot, material: 0, digit: 0 };
  if (DELIVERIES.has(ch)) return { ...base, kind: 'delivery' };
  const g = SPELL_GLYPH_BY_CHAR.get(ch);
  if (g) {
    if (g.kind === 'digit') return { ...base, kind: 'digit', digit: Number(ch) };
    return { ...base, kind: g.kind };
  }
  if (ch === '0' || ch === '1') return { ...base, kind: 'digit', digit: Number(ch) };
  const m = MATERIAL_BY_GLYPH.get(ch);
  if (m !== undefined && m !== 0) return { ...base, kind: 'matter', material: m };
  return { ...base, kind: 'unknown' };
}

/** Split a spell into glyph tokens. Spaces are skipped and take no slot. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let pos = 0;
  let slot = 0;
  for (const ch of text) {
    if (!isSpace(ch)) out.push(classify(ch, pos, slot++));
    pos += ch.length;
  }
  return out;
}

const q = (ch: string): string => `\`${ch}\``;

class Parser {
  private i = 0;
  private sawDelivery = false;
  readonly errors: SpellError[] = [];

  constructor(private readonly t: readonly Token[]) {}

  run(): Group[] {
    return this.groups(0);
  }

  private peek(): Token | undefined {
    return this.t[this.i];
  }

  private err(code: SpellErrorCode, pos: number, message: string): void {
    this.errors.push({ code, pos, message });
  }

  /** group+ until the end, or until a `]` when inside a loop. */
  private groups(depth: number): Group[] {
    const out: Group[] = [];
    for (let tok = this.peek(); tok; tok = this.peek()) {
      if (tok.kind === 'close') {
        if (depth > 0) break;
        this.err('unmatchedClose', tok.pos, `This ${q(']')} has no ${q('[')} to close.`);
        this.i++;
      } else if (tok.kind === 'open') {
        out.push(this.loop(depth));
      } else if (tok.kind === 'split' || tok.kind === 'delivery') {
        const c = this.cast(depth);
        if (c) out.push(c);
      } else {
        this.stray(tok);
        this.i++;
      }
    }
    return out;
  }

  /** A token that can't start a group. */
  private stray(tok: Token): void {
    switch (tok.kind) {
      case 'matter':
      case 'chaos':
        if (this.sawDelivery) {
          this.err('matterFirst', tok.pos, `${q(tok.ch)} needs a delivery glyph before it, like ${q('>' + tok.ch)}.`);
        } else {
          this.err('matterFirst', tok.pos, `Start with a delivery glyph, like ${q('>')}.`);
        }
        break;
      case 'digit':
        this.err('digitPlace', tok.pos, `A digit repeats the matter glyph before it, like ${q('>~3')}.`);
        break;
      case 'trigger':
        this.err('triggerPlace', tok.pos, `${q('!')} goes right after a cast, like ${q('>!>~')}.`);
        break;
      default:
        break; // unknown glyphs were already reported
    }
  }

  private cast(depth: number): CastNode | null {
    let split = 0;
    let lastSplit: Token | undefined;
    for (let tok = this.peek(); tok && tok.kind === 'split'; tok = this.peek()) {
      split++;
      lastSplit = tok;
      this.i++;
    }
    const d = this.peek();
    if (!d || d.kind !== 'delivery') {
      if (lastSplit) this.err('splitPlace', lastSplit.pos, `${q('+')} goes right before a delivery glyph, like ${q('+>')}.`);
      return null;
    }
    this.i++;
    this.sawDelivery = true;

    const payload: PayloadItem[] = [];
    let last: 'delivery' | 'matter' | 'chaos' | 'count' = 'delivery';
    for (let tok = this.peek(); tok; tok = this.peek()) {
      if (tok.kind === 'matter') {
        payload.push({ kind: 'matter', material: tok.material, count: 1, pos: tok.pos });
        last = 'matter';
      } else if (tok.kind === 'chaos') {
        payload.push({ kind: 'chaos', pos: tok.pos });
        last = 'chaos';
      } else if (tok.kind === 'digit') {
        const item = payload[payload.length - 1];
        if (last === 'matter' && item?.kind === 'matter') {
          if (tok.digit < 2) this.err('digitPlace', tok.pos, 'Counts go from 2 to 9.');
          else item.count = tok.digit;
          last = 'count';
        } else if (last === 'count') {
          this.err('digitPlace', tok.pos, `Only one digit: ${q('~9')} is the most.`);
        } else if (last === 'chaos') {
          this.err('digitPlace', tok.pos, `${q('?')} can't take a count.`);
        } else {
          this.err('digitPlace', tok.pos, `A digit repeats the matter glyph before it, like ${q(d.ch + '~3')}.`);
        }
      } else if (tok.kind !== 'unknown') {
        break;
      }
      this.i++;
    }

    let trigger: Group[] | null = null;
    const bang = this.peek();
    if (bang && bang.kind === 'trigger') {
      this.i++;
      const before = this.errors.length;
      trigger = this.groups(depth);
      if (trigger.length === 0 && this.errors.length === before) {
        this.err('triggerEmpty', bang.pos, `${q('!')} needs a cast after it, like ${q('!>~')}.`);
      }
    }
    return { kind: 'cast', pos: d.pos, split, delivery: d.ch as Delivery, payload, trigger };
  }

  private loop(depth: number): LoopNode {
    const open = this.peek()!;
    this.i++;
    const body = this.groups(depth + 1);
    const close = this.peek();
    let count = 1;
    if (!close || close.kind !== 'close') {
      this.err('unclosedLoop', open.pos, `This ${q('[')} is never closed: end it with ${q(']')} and a count, like ${q('[>.]4')}.`);
    } else {
      this.i++;
      const c = this.peek();
      if (c && c.kind === 'digit') {
        this.i++;
        if (c.digit < 2) this.err('digitPlace', c.pos, 'Loop counts go from 2 to 9.');
        else count = c.digit;
        const extra = this.peek();
        if (extra && extra.kind === 'digit') {
          this.err('digitPlace', extra.pos, `Only one digit: ${q(']9')} is the most.`);
          this.i++;
        }
      } else {
        this.err('loopCount', close.pos, `A loop needs a count after ${q(']')}, like ${q(']4')}.`);
      }
    }
    if (body.length === 0) this.err('emptyLoop', open.pos, 'This loop is empty: put a cast inside, like [>.]4.');
    return { kind: 'loop', pos: open.pos, body, count };
  }
}

/** Parse a spell. Never throws; check `errors`. */
export function parseSpell(text: string, opts: ParseOptions = {}): ParseResult {
  const tokens = tokenize(text);
  const errors: SpellError[] = [];
  for (const t of tokens) {
    if (t.kind === 'unknown') {
      errors.push({ code: 'unknownGlyph', pos: t.pos, message: `${q(t.ch)} isn't a spell glyph.` });
    } else if (opts.owns && !opts.owns(t.ch)) {
      const message =
        t.kind === 'matter'
          ? `You have never collected ${q(t.ch)}: harvest some first.`
          : `You don't know ${q(t.ch)} yet.`;
      errors.push({ code: 'unownedGlyph', pos: t.pos, message });
    }
  }
  if (tokens.length === 0) {
    errors.push({ code: 'empty', pos: -1, message: `The wand is empty: write a delivery glyph, like ${q('>')}.` });
  }
  if (opts.slots !== undefined && tokens.length > opts.slots) {
    const first = tokens[opts.slots]!;
    errors.push({
      code: 'tooLong',
      pos: first.pos,
      message: `This wand holds ${opts.slots} glyphs; the spell has ${tokens.length}.`,
    });
  }
  const parser = new Parser(tokens);
  const groups = parser.run();
  errors.push(...parser.errors);
  errors.sort((a, b) => a.pos - b.pos);
  return { tokens, groups, errors, slotsUsed: tokens.length };
}
