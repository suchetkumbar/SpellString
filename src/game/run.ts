import { generateLevel } from '../core/levelgen';
import { Rng } from '../core/rng';
import { levelSeed } from '../core/seeds';
import { BIOMES, LEVELS_PER_BIOME, type BiomeDef } from '../data/biomes';
import { MATERIALS } from '../data/materials';
import { MAX_WANDS, MAX_WAND_SLOTS, WAND_TEMPLATES, WAND_UPGRADES, type WandTemplateDef, type WandUpgradeDef } from '../data/shrine';
import { MAT, type MaterialKey } from '../data/materials';
import { SPELL_GLYPHS } from '../data/spellGlyphs';
import { TUNING } from '../data/tuning';
import { Game, type Kit } from './game';
import { Pouch } from './harvest';
import type { TickInput } from './input';
import { RunStats } from './stats';
import { Wand } from './wand';
import { spellName } from './casting';
import { kitFromSave, serializeKit, type RunSave } from './runsave';
import type { Codex } from './codex';
import type { StartingWandDef } from '../data/unlocks';

/**
 * run: the descent (random seed). daily: the descent on today's shared seed.
 * tutorial: the hand-made tutorial level. lab: the test room in Lab mode with
 * every glyph. test: the test room as a plain level (developer/browser tests).
 */
export type RunMode = 'run' | 'daily' | 'tutorial' | 'lab' | 'test';

/** level: playing. shrine: between levels, picking an offer. dead: the death screen. won: finished. */
export type RunPhase = 'level' | 'shrine' | 'dead' | 'won';

export type ShrineOffer =
  | { readonly kind: 'glyph'; readonly glyph: string; readonly title: string; readonly text: string }
  | { readonly kind: 'wand'; readonly upgrade: WandUpgradeDef; readonly title: string; readonly text: string }
  | { readonly kind: 'newWand'; readonly template: WandTemplateDef; readonly title: string; readonly text: string };

/** Hand-made levels a run can use (the browser imports them; tests read the files). */
export interface RunLevels {
  readonly tutorial?: string;
  readonly testRoom?: string;
  /** The Wyrm's lair: the last level of a descent. */
  readonly lair?: string;
}

/** A whole run: the levels in order, shrines between them, and the postcard at the end. */
export class Run {
  phase: RunPhase = 'level';
  /** 1-based level number. */
  depth = 1;
  game: Game;
  offers: ShrineOffer[] = [];
  /** Gifts taken at the current shrine: the first is free, each more costs gold. */
  shrinePicks = 0;
  /** When the current level started (game ticks summed over the run), for the postcard. */
  ticks = 0;
  private readonly rng: Rng;

  constructor(
    readonly seed: number,
    readonly mode: RunMode,
    private readonly levels: RunLevels = {},
    /** Shown on the postcard for daily runs. */
    readonly label = '',
    /** Discoveries, unlocks and the spell journal. Optional: without it nothing persists and everything is open. */
    readonly codex: Codex | null = null,
  ) {
    this.rng = new Rng(seed ^ 0x5eed);
    this.game = this.makeLevel(undefined);
  }

  /** Write a finished run into the Codex's journal (descents only). */
  private record(): void {
    if (!this.codex || !this.isDescent) return;
    const p = this.game.player;
    this.codex.recordRun(
      {
        seed: this.seed,
        mode: this.mode,
        depth: this.depth,
        totalLevels: this.totalLevels,
        ending: this.phase === 'won' ? 'made it out alive' : p.killedBy ? `killed by: ${p.killedBy.glyph} (${p.killedBy.text})` : 'gave up',
        spell: spellName(this.game.wand.spell.text),
        best: this.game.stats.bestSpell(),
        date: this.label || undefined,
      },
      this.game.stats.casts,
    );
  }

  /** Levels in this run: two per biome for a descent, one otherwise. */
  get totalLevels(): number {
    // Two levels per biome, then the Wyrm's lair.
    return this.isDescent ? BIOMES.length * LEVELS_PER_BIOME + 1 : 1;
  }

  /** The last level of a descent: the Wyrm's lair. */
  get isBossLevel(): boolean {
    return this.isDescent && this.depth === this.totalLevels;
  }

  get isDescent(): boolean {
    return this.mode === 'run' || this.mode === 'daily';
  }

  /** The current biome (descents only). */
  get biome(): BiomeDef | null {
    if (!this.isDescent || this.isBossLevel) return null;
    return BIOMES[Math.min(BIOMES.length - 1, Math.floor((this.depth - 1) / LEVELS_PER_BIOME))] ?? null;
  }

  /** Where we are, for the HUD: "Sandstone Hollows 1-2", "Tutorial", ... */
  get place(): string {
    if (this.isBossLevel) return "The Wyrm's Lair";
    const b = this.biome;
    if (b) return `${b.name} ${Math.floor((this.depth - 1) / LEVELS_PER_BIOME) + 1}-${((this.depth - 1) % LEVELS_PER_BIOME) + 1}`;
    return this.mode === 'tutorial' ? 'Tutorial' : this.mode === 'lab' ? 'Lab' : 'Test room';
  }

  /** One tick of play. Moves to the shrine, the end or the death screen when the level says so. */
  step(input: TickInput, simulateWorld = true): void {
    if (this.phase !== 'level') return;
    this.game.step(input, simulateWorld);
    this.ticks++;
    if (this.game.player.dead) {
      this.game.recordReactions();
      this.phase = 'dead';
      this.record();
    } else if (this.isBossLevel && this.game.features.legendaryTaken) {
      // The Wyrm is dead and its eye is taken: the run is won.
      this.game.recordReactions();
      this.phase = 'won';
      this.record();
    } else if (this.game.exitReached) {
      this.game.recordReactions();
      if (this.depth >= this.totalLevels) {
        this.phase = 'won';
        this.record();
      } else {
        this.phase = 'shrine';
        this.offers = this.rollOffers();
      }
    }
  }

  /** Gold the next gift at this shrine costs (the first is free). */
  get giftCost(): number {
    return this.shrinePicks === 0 ? 0 : TUNING.shrineExtraCost;
  }

  /** Gold in the wallet. */
  get gold(): number {
    return this.game.pouch.count(MAT.gold);
  }

  /**
   * Take a shrine gift (index into `offers`). The first is free; more cost
   * gold. With nothing left to take or afford, go down to the next level.
   */
  choose(index: number): void {
    if (this.phase !== 'shrine') return;
    const offer = this.offers[index];
    const cost = this.giftCost;
    if (!offer || this.gold < cost) return;
    for (let k = 0; k < cost; k++) this.game.pouch.spend(MAT.gold);
    const g = this.game;
    if (offer.kind === 'glyph') {
      g.known.add(offer.glyph);
      if (offer.glyph === '[') g.known.add(']');
    } else if (offer.kind === 'wand') {
      applyUpgrade(g.wand, offer.upgrade);
    } else if (g.wands.length < MAX_WANDS) {
      g.wands.push(new Wand({ ...offer.template.stats }));
    }
    this.shrinePicks++;
    this.offers.splice(index, 1);
    if (this.offers.length === 0 || this.gold < TUNING.shrineExtraCost) this.descend();
  }

  /**
   * Save and quit at a shrine: the run is written as "the next level, with
   * this kit" (healed, gifts applied), to pick up later from the title.
   */
  saveAndQuit(): RunSave | null {
    if (this.phase !== 'shrine' || !this.isDescent) return null;
    const kit = this.game.kit();
    return serializeKit({ ...kit, hp: Math.min(TUNING.playerMaxHp, kit.hp + TUNING.shrineHeal) }, this, this.depth + 1);
  }

  /** Continue a saved run: straight into the level it was saved before. */
  static resume(save: RunSave, levels: RunLevels, codex: Codex | null = null): Run {
    const run = new Run(save.seed, save.mode, levels, save.label, codex);
    run.depth = save.depth;
    run.game = run.makeLevel(kitFromSave(save));
    return run;
  }

  /** Leave the shrine: heal a little and go down to the next level. */
  descend(): void {
    if (this.phase !== 'shrine') return;
    const kit = this.game.kit();
    this.depth++;
    this.game = this.makeLevel({ ...kit, hp: kit.hp + TUNING.shrineHeal });
    this.phase = 'level';
    this.offers = [];
    this.shrinePicks = 0;
  }

  /** Three offers: new glyphs the witch doesn't know yet, then wand upgrades. */
  private rollOffers(): ShrineOffer[] {
    const known = this.game.known;
    // With a Codex, the advanced glyphs only appear once unlocked.
    const allowed = this.codex?.shrineGlyphs();
    const glyphs: ShrineOffer[] = SPELL_GLYPHS.filter(
      (g) => g.available && g.kind !== 'digit' && g.kind !== 'close' && !known.has(g.glyph) && (!allowed || allowed.has(g.glyph)),
    ).map((g) => ({ kind: 'glyph', glyph: g.glyph, title: `${g.glyph}  ${g.name}`, text: g.help }));
    const wand = this.game.wand;
    const upgrades: ShrineOffer[] = WAND_UPGRADES.filter((u) => !(u.slots && wand.stats.slots >= MAX_WAND_SLOTS)).map((u) => ({
      kind: 'wand',
      upgrade: u,
      title: u.title,
      text: u.text,
    }));
    if (this.game.wands.length < MAX_WANDS) {
      const t = WAND_TEMPLATES[this.rng.int(WAND_TEMPLATES.length)]!;
      upgrades.push({ kind: 'newWand', template: t, title: t.title, text: t.text });
    }
    const pick = (list: ShrineOffer[]): ShrineOffer | null => (list.length ? list.splice(this.rng.int(list.length), 1)[0]! : null);
    const out: ShrineOffer[] = [];
    // At least one glyph when any are left: new glyphs are the exciting part.
    const g = pick(glyphs);
    if (g) out.push(g);
    const rest = [...glyphs, ...upgrades];
    while (out.length < 3) {
      const o = pick(rest);
      if (!o) break;
      out.push(o);
    }
    return out;
  }

  private makeLevel(kit: Kit | undefined): Game {
    switch (this.mode) {
      case 'tutorial':
        return Game.fromAscii(this.levels.tutorial ?? '', this.seed, { kit, codex: this.codex ?? undefined });
      case 'lab':
        return Game.fromAscii(this.levels.testRoom ?? '', this.seed, { kit: kit ?? labKit(this.codex), codex: this.codex ?? undefined });
      case 'test':
        return Game.fromAscii(this.levels.testRoom ?? '', this.seed, { kit: kit ?? sandboxKit(false) });
      default: {
        if (this.isBossLevel) {
          return Game.fromAscii(this.levels.lair ?? '', levelSeed(this.seed, this.depth), { kit, chestLoot: LAIR_LOOT, codex: this.codex ?? undefined });
        }
        const biome = this.biome!;
        const s = levelSeed(this.seed, this.depth);
        // A fresh run starts with the chosen starting wand (daily runs always use the plain one, so they're fair).
        const start = kit ?? (this.mode === 'run' && this.codex ? startingKit(this.codex.startingWand) : undefined);
        return new Game(generateLevel(s, biome, this.depth), s, { kit: start, chestLoot: biome.chestLoot, codex: this.codex ?? undefined });
      }
    }
  }

  /** The death screen's copyable postcard. */
  postcard(): string {
    const g = this.game;
    g.recordReactions();
    const p = g.player;
    const where = this.isDescent ? `depth ${this.depth}/${this.totalLevels}` : this.place.toLowerCase();
    const ending =
      this.phase === 'won'
        ? 'made it out alive'
        : p.killedBy
          ? `killed by: ${p.killedBy.glyph} (${p.killedBy.text})`
          : 'still going';
    const best = g.stats.bestSpell() ?? '-';
    const label = this.label ? `  ${this.label}` : '';
    return [
      `SPELLSTRING  seed ${this.seed}${label}  ${where}`,
      ending,
      `best spell: ${best}   reactions found: ${g.stats.reactions.size}`,
    ].join('\n');
  }
}

/** What the lair's chests hold: the answers to the Wyrm's segments, and boom. */
const LAIR_LOOT: readonly MaterialKey[] = ['fire', 'water', 'ice', 'acid', 'gunpowder', 'oil'];

/** Apply a shrine's wand upgrade. */
export function applyUpgrade(wand: Wand, u: WandUpgradeDef): void {
  const s = wand.stats;
  wand.stats = {
    slots: Math.min(MAX_WAND_SLOTS, s.slots + (u.slots ?? 0)),
    maxMana: s.maxMana + (u.maxMana ?? 0),
    manaRegen: s.manaRegen * (u.manaRegen ?? 1),
    castDelayTicks: s.castDelayTicks,
    rechargeTicks: Math.max(1, Math.round(s.rechargeTicks * (u.rechargeTicks ?? 1))),
  };
  if (u.maxMana) wand.mana += u.maxMana;
}

/** Test room and Lab: every available glyph known; Lab also fills the pouch and hands over three wands. */
function sandboxKit(fullPouch: boolean): Kit {
  const pouch = new Pouch();
  if (fullPouch) for (const m of MATERIALS) if (m.id !== 0) pouch.add(m.id, pouch.cap);
  const known = new Set(SPELL_GLYPHS.filter((g) => g.available && g.kind !== 'digit').map((g) => g.glyph));
  const wands = fullPouch ? WAND_TEMPLATES.map((t) => new Wand({ ...t.stats })) : [new Wand()];
  if (fullPouch) wands[0] = new Wand();
  return { hp: TUNING.playerMaxHp, pouch, wands, activeWand: 0, known, stats: new RunStats() };
}

/** A fresh run's kit with a chosen starting wand: its glyphs known and its spell written. Same stats for every wand. */
export function startingKit(w: StartingWandDef): Kit {
  return {
    hp: TUNING.playerMaxHp,
    pouch: new Pouch(),
    wands: [new Wand(undefined, w.spell)],
    activeWand: 0,
    known: new Set(w.glyphs),
    stats: new RunStats(),
  };
}

/**
 * Lab: a wand with every glyph you've discovered, a full pouch of the
 * materials you've discovered, and three wands. Without a Codex, everything.
 */
function labKit(codex: Codex | null): Kit {
  if (!codex) return sandboxKit(true);
  const kit = sandboxKit(true);
  const pouch = new Pouch();
  for (const m of MATERIALS) if (m.id !== 0 && codex.has('material', m.key)) pouch.add(m.id, pouch.cap);
  const known = new Set(['>', ...codex.found('glyph').filter((g) => !MATERIALS.some((m) => m.glyph === g))]);
  if (known.has('[')) known.add(']');
  return { ...kit, pouch, known };
}
