import { generateLevel } from '../core/levelgen';
import { Rng } from '../core/rng';
import { levelSeed } from '../core/seeds';
import { BIOMES, LEVELS_PER_BIOME, type BiomeDef } from '../data/biomes';
import { MATERIALS } from '../data/materials';
import { MAX_WAND_SLOTS, WAND_UPGRADES, type WandUpgradeDef } from '../data/shrine';
import { SPELL_GLYPHS } from '../data/spellGlyphs';
import { TUNING } from '../data/tuning';
import { Game, type Kit } from './game';
import { Pouch } from './harvest';
import type { TickInput } from './input';
import { RunStats } from './stats';
import { Wand } from './wand';

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
  | { readonly kind: 'wand'; readonly upgrade: WandUpgradeDef; readonly title: string; readonly text: string };

/** Hand-made levels a run can use (the browser imports them; tests read the files). */
export interface RunLevels {
  readonly tutorial?: string;
  readonly testRoom?: string;
}

/** A whole run: the levels in order, shrines between them, and the postcard at the end. */
export class Run {
  phase: RunPhase = 'level';
  /** 1-based level number. */
  depth = 1;
  game: Game;
  offers: ShrineOffer[] = [];
  /** When the current level started (game ticks summed over the run), for the postcard. */
  ticks = 0;
  private readonly rng: Rng;

  constructor(
    readonly seed: number,
    readonly mode: RunMode,
    private readonly levels: RunLevels = {},
    /** Shown on the postcard for daily runs. */
    readonly label = '',
  ) {
    this.rng = new Rng(seed ^ 0x5eed);
    this.game = this.makeLevel(undefined);
  }

  /** Levels in this run: two per biome for a descent, one otherwise. */
  get totalLevels(): number {
    return this.isDescent ? BIOMES.length * LEVELS_PER_BIOME : 1;
  }

  get isDescent(): boolean {
    return this.mode === 'run' || this.mode === 'daily';
  }

  /** The current biome (descents only). */
  get biome(): BiomeDef | null {
    if (!this.isDescent) return null;
    return BIOMES[Math.min(BIOMES.length - 1, Math.floor((this.depth - 1) / LEVELS_PER_BIOME))] ?? null;
  }

  /** Where we are, for the HUD: "Sandstone Hollows 1-2", "Tutorial", ... */
  get place(): string {
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
    } else if (this.game.exitReached) {
      this.game.recordReactions();
      if (this.depth >= this.totalLevels) {
        this.phase = 'won';
      } else {
        this.phase = 'shrine';
        this.offers = this.rollOffers();
      }
    }
  }

  /** Pick a shrine offer (index into `offers`), heal a little, and go down to the next level. */
  choose(index: number): void {
    if (this.phase !== 'shrine') return;
    const offer = this.offers[index];
    if (!offer) return;
    const kit = this.game.kit();
    if (offer.kind === 'glyph') {
      (kit.known as Set<string>).add(offer.glyph);
      if (offer.glyph === '[') (kit.known as Set<string>).add(']');
    } else {
      applyUpgrade(kit.wand, offer.upgrade);
    }
    this.depth++;
    this.game = this.makeLevel({ ...kit, hp: kit.hp + TUNING.shrineHeal });
    this.phase = 'level';
    this.offers = [];
  }

  /** Three offers: new glyphs the witch doesn't know yet, then wand upgrades. */
  private rollOffers(): ShrineOffer[] {
    const known = this.game.known;
    const glyphs: ShrineOffer[] = SPELL_GLYPHS.filter(
      (g) => g.available && g.kind !== 'digit' && g.kind !== 'close' && !known.has(g.glyph),
    ).map((g) => ({ kind: 'glyph', glyph: g.glyph, title: `${g.glyph}  ${g.name}`, text: g.help }));
    const wand = this.game.wand;
    const upgrades: ShrineOffer[] = WAND_UPGRADES.filter((u) => !(u.slots && wand.stats.slots >= MAX_WAND_SLOTS)).map((u) => ({
      kind: 'wand',
      upgrade: u,
      title: u.title,
      text: u.text,
    }));
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
        return Game.fromAscii(this.levels.tutorial ?? '', this.seed, { kit });
      case 'lab':
      case 'test':
        return Game.fromAscii(this.levels.testRoom ?? '', this.seed, { kit: kit ?? sandboxKit(this.mode === 'lab') });
      default: {
        const biome = this.biome!;
        const s = levelSeed(this.seed, this.depth);
        return new Game(generateLevel(s, biome, this.depth), s, { kit, chestLoot: biome.chestLoot });
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

/** Test room and Lab: every available glyph known; Lab also fills the pouch. */
function sandboxKit(fullPouch: boolean): Kit {
  const pouch = new Pouch();
  if (fullPouch) for (const m of MATERIALS) if (m.id !== 0) pouch.add(m.id, pouch.cap);
  const known = new Set(SPELL_GLYPHS.filter((g) => g.available && g.kind !== 'digit').map((g) => g.glyph));
  return { hp: TUNING.playerMaxHp, pouch, wand: new Wand(), known, stats: new RunStats() };
}
