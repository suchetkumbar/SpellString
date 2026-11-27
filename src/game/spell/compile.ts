import { buildPlan, type CastPlan, type PlanLimits, DEFAULT_LIMITS } from './plan';
import { parseSpell, type ParseOptions, type ParseResult } from './parse';

/** A spell parsed, checked and turned into a plan, ready for the wand, the editor or the HUD. */
export interface CompiledSpell {
  readonly text: string;
  readonly parse: ParseResult;
  readonly plan: CastPlan;
  /** No errors: the wand can fire it. */
  readonly ok: boolean;
}

export function compileSpell(text: string, opts: ParseOptions = {}, limits: PlanLimits = DEFAULT_LIMITS): CompiledSpell {
  const parse = parseSpell(text, opts);
  const plan = buildPlan(parse.groups, limits);
  return { text, parse, plan, ok: parse.errors.length === 0 && plan.casts.length > 0 };
}

/**
 * The spell editor only accepts typed glyphs you own. Returns the first typed
 * character that isn't an owned glyph (spaces are always fine), or null.
 * Pasted text skips this check: missing glyphs are highlighted instead.
 */
export function firstRejected(typed: string, owns: (ch: string) => boolean): string | null {
  for (const ch of typed) {
    if (ch === ' ') continue;
    if (!owns(ch)) return ch;
  }
  return null;
}
