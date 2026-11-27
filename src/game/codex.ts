import type { KeyValueStore } from '../core/storage';
import { CREATURES } from '../data/creatures';
import { MATERIALS, type MaterialKey } from '../data/materials';
import { REACTIONS, type Reaction } from '../data/reactions';
import { SPELL_GLYPHS } from '../data/spellGlyphs';
import { BASE_SHRINE_GLYPHS, STARTING_WANDS, UNLOCKS, type DiscoveryKind, type StartingWandDef, type UnlockDef } from '../data/unlocks';

/** Where the Codex lives in storage. Bump the version if the format changes incompatibly. */
export const CODEX_KEY = 'spellstring.codex.v1';
/** Run endings kept in the journal. */
const JOURNAL_RUNS = 20;

/** One finished run, for the spell journal. */
export interface RunRecord {
  readonly seed: number;
  readonly mode: string;
  readonly depth: number;
  readonly totalLevels: number;
  /** "killed by: ^ (burning)", "made it out alive", ... */
  readonly ending: string;
  /** The spell in the wand in hand when the run ended. */
  readonly spell: string;
  readonly best: string | null;
  readonly date?: string;
}

interface CodexSave {
  readonly v: 1;
  readonly found: Record<DiscoveryKind, string[]>;
  readonly casts: Record<string, number>;
  readonly runs: RunRecord[];
  readonly runCount: number;
  readonly startingWand: string;
}

const KINDS: readonly DiscoveryKind[] = ['reaction', 'material', 'creature', 'glyph'];

const glyphOf = (key: MaterialKey): string => MATERIALS.find((m) => m.key === key)?.glyph ?? '?';

/** A reaction as a formula: `^ + = -> ^`, `" -> ~`. Consumed cells show as `·`; explosions as `*boom*`. */
export function reactionFormula(r: Reaction): string {
  if (r.kind === 'decay') {
    const outs = r.outcomes.filter((o) => o.to !== 'empty').map((o) => glyphOf(o.to));
    return `${glyphOf(r.from)} -> ${outs.length > 0 ? outs.join(' ') : '·'}`;
  }
  const left = `${glyphOf(r.a)} + ${glyphOf(r.b)}`;
  if (r.explode) return `${left} -> *boom*`;
  // Only what the reaction makes: the sides that change (acid spending a bite doesn't count).
  const outs: string[] = [];
  if (r.aTo && r.aUses === undefined) outs.push(r.aTo === 'empty' ? '·' : glyphOf(r.aTo));
  if (r.bTo) outs.push(r.bTo === 'empty' ? '·' : glyphOf(r.bTo));
  return `${left} -> ${outs.length > 0 ? outs.join(' ') : '·'}`;
}

/** Everything that can be discovered, by kind. */
export const CODEX_ENTRIES: Readonly<Record<DiscoveryKind, readonly string[]>> = {
  reaction: REACTIONS.map((r) => r.id),
  material: MATERIALS.filter((m) => m.id !== 0).map((m) => m.key),
  creature: CREATURES.map((c) => c.key),
  glyph: SPELL_GLYPHS.filter((g) => g.kind !== 'digit' && g.kind !== 'close').map((g) => g.glyph),
};

/** What a discovery says: the formula for reactions, glyph and name otherwise. */
export function entryText(kind: DiscoveryKind, id: string): string {
  switch (kind) {
    case 'reaction': {
      const r = REACTIONS.find((x) => x.id === id);
      return r ? reactionFormula(r) : id;
    }
    case 'material': {
      const m = MATERIALS.find((x) => x.key === id);
      return m ? `${m.glyph}  ${m.name}` : id;
    }
    case 'creature': {
      const c = CREATURES.find((x) => x.key === id);
      return c ? `${c.glyph}  ${c.name}` : id;
    }
    case 'glyph': {
      const g = SPELL_GLYPHS.find((x) => x.glyph === id);
      return g ? `${g.glyph}  ${g.name}` : id;
    }
  }
}

function emptySave(): CodexSave {
  return { v: 1, found: { reaction: [], material: [], creature: [], glyph: [] }, casts: {}, runs: [], runCount: 0, startingWand: 'plain' };
}

/** Parse saved JSON defensively: anything malformed falls back to an empty Codex. */
function parse(text: string | null): CodexSave {
  if (!text) return emptySave();
  try {
    const raw = JSON.parse(text) as Partial<CodexSave>;
    if (raw.v !== 1 || typeof raw.found !== 'object' || raw.found === null) return emptySave();
    const base = emptySave();
    for (const k of KINDS) {
      const list = (raw.found as Record<string, unknown>)[k];
      if (Array.isArray(list)) base.found[k] = list.filter((x): x is string => typeof x === 'string' && CODEX_ENTRIES[k].includes(x));
    }
    const casts: Record<string, number> = {};
    if (raw.casts && typeof raw.casts === 'object') {
      for (const [s, n] of Object.entries(raw.casts)) if (typeof n === 'number' && n > 0) casts[s] = n;
    }
    const runs = Array.isArray(raw.runs) ? raw.runs.filter((r) => r && typeof r === 'object' && typeof r.seed === 'number').slice(-JOURNAL_RUNS) : [];
    return {
      v: 1,
      found: base.found,
      casts,
      runs,
      runCount: typeof raw.runCount === 'number' ? raw.runCount : runs.length,
      startingWand: typeof raw.startingWand === 'string' ? raw.startingWand : 'plain',
    };
  } catch {
    return emptySave();
  }
}

/**
 * The Reaction Codex: everything you've discovered across runs, the unlocks
 * that earns, and the spell journal. Saved to the store on every change (it's
 * small, and changes are rare).
 */
export class Codex {
  private data: CodexSave;
  private readonly sets: Record<DiscoveryKind, Set<string>>;

  constructor(private readonly store: KeyValueStore) {
    this.data = parse(store.get(CODEX_KEY));
    this.sets = {
      reaction: new Set(this.data.found.reaction),
      material: new Set(this.data.found.material),
      creature: new Set(this.data.found.creature),
      glyph: new Set(this.data.found.glyph),
    };
  }

  has(kind: DiscoveryKind, id: string): boolean {
    return this.sets[kind].has(id);
  }

  count(kind: DiscoveryKind): number {
    return this.sets[kind].size;
  }

  /** Discovered ids of a kind, in discovery order. */
  found(kind: DiscoveryKind): readonly string[] {
    return this.data.found[kind];
  }

  /**
   * Record a discovery. Returns null if it was already known, else the
   * unlocks this discovery just earned (often none).
   */
  discover(kind: DiscoveryKind, id: string): UnlockDef[] | null {
    if (this.sets[kind].has(id) || !CODEX_ENTRIES[kind].includes(id)) return null;
    const before = new Set(this.unlocked().map((u) => u.id));
    this.sets[kind].add(id);
    this.data.found[kind].push(id);
    this.save();
    return this.unlocked().filter((u) => !before.has(u.id));
  }

  /** Does the Codex meet this requirement? */
  meets(u: UnlockDef): boolean {
    const r = u.requires;
    if ((r.reactions ?? 0) > this.count('reaction')) return false;
    if ((r.materials ?? 0) > this.count('material')) return false;
    if ((r.creatures ?? 0) > this.count('creature')) return false;
    if ((r.glyphs ?? 0) > this.count('glyph')) return false;
    for (const id of r.ids ?? []) {
      const [kind, key] = id.split(':') as [DiscoveryKind, string];
      if (!this.sets[kind]?.has(key)) return false;
    }
    return true;
  }

  unlocked(): UnlockDef[] {
    return UNLOCKS.filter((u) => this.meets(u));
  }

  /** Glyphs shrines may offer: the base set plus unlocked ones. */
  shrineGlyphs(): Set<string> {
    const out = new Set(BASE_SHRINE_GLYPHS);
    for (const u of this.unlocked()) if (u.shrineGlyph) out.add(u.shrineGlyph);
    return out;
  }

  /** Starting wands you can pick (the plain one always). */
  startingWands(): StartingWandDef[] {
    const open = new Set(this.unlocked().map((u) => u.startingWand).filter(Boolean));
    return STARTING_WANDS.filter((w) => w.id === 'plain' || open.has(w.id));
  }

  /** The chosen starting wand (falls back to plain if it's no longer available). */
  get startingWand(): StartingWandDef {
    return this.startingWands().find((w) => w.id === this.data.startingWand) ?? STARTING_WANDS[0]!;
  }

  /** Step to the next unlocked starting wand. */
  cycleStartingWand(): StartingWandDef {
    const list = this.startingWands();
    const i = list.findIndex((w) => w.id === this.startingWand.id);
    const next = list[(i + 1) % list.length]!;
    this.data = { ...this.data, startingWand: next.id };
    this.save();
    return next;
  }

  /** Fold a finished run into the journal: its casts, and how it ended. */
  recordRun(record: RunRecord, casts: ReadonlyMap<string, number>): void {
    const merged = { ...this.data.casts };
    for (const [s, n] of casts) merged[s] = (merged[s] ?? 0) + n;
    this.data = { ...this.data, casts: merged, runs: [...this.data.runs, record].slice(-JOURNAL_RUNS), runCount: this.data.runCount + 1 };
    this.save();
  }

  /** Most-cast spells across all runs. */
  topSpells(n = 8): { spell: string; casts: number }[] {
    return Object.entries(this.data.casts)
      .map(([spell, casts]) => ({ spell, casts }))
      .sort((a, b) => b.casts - a.casts || a.spell.localeCompare(b.spell))
      .slice(0, n);
  }

  /** Recent run endings, newest first. */
  recentRuns(): readonly RunRecord[] {
    return [...this.data.runs].reverse();
  }

  get runCount(): number {
    return this.data.runCount;
  }

  private save(): void {
    this.store.set(CODEX_KEY, JSON.stringify(this.data));
  }
}
