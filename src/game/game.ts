import { Rng } from '../core/rng';
import { loadAsciiLevel, type LevelLayout } from '../core/level';
import { Simulation } from '../core/sim';
import type { CreatureKey } from '../data/creatures';
import { MAT, MATERIALS, MATERIAL_BY_GLYPH, type MaterialKey } from '../data/materials';
import { MAX_MATERIALS } from '../core/materialTable';
import type { DiscoveryKind } from '../data/unlocks';
import { CODEX_ENTRIES, entryText, type Codex } from './codex';
import { REACTIONS } from '../data/reactions';
import { SPELL_GLYPH_BY_CHAR, STARTING_GLYPHS } from '../data/spellGlyphs';
import { TUNING } from '../data/tuning';
import { Carriers } from './carriers';
import { Caster, spellName } from './casting';
import { applyExplosions } from './explosions';
import type { PlannedCast } from './spell/plan';
import type { GameContext, MessageKind } from './context';
import { Creature } from './creature';
import { updateCreatures } from './creatures';
import { Effects } from './effects';
import { Features } from './features';
import { Harvester, Pouch } from './harvest';
import type { TickInput } from './input';
import { Player } from './player';
import { RunStats } from './stats';
import { Wand } from './wand';

export type { TickInput } from './input';
export { NO_INPUT, tickInput } from './input';

export interface GameMessage {
  readonly text: string;
  readonly kind: MessageKind;
  readonly tick: number;
}

/** What the witch carries from one level to the next. */
export interface Kit {
  readonly hp: number;
  readonly pouch: Pouch;
  /** Up to three wands, and which one is in hand. */
  readonly wands: readonly Wand[];
  readonly activeWand: number;
  readonly known: ReadonlySet<string>;
  readonly stats: RunStats;
}

/** A DISCOVERED (or UNLOCKED) banner for the HUD. */
export interface Discovery {
  readonly title: 'DISCOVERED' | 'UNLOCKED';
  readonly text: string;
  readonly tick: number;
}

export interface GameOptions {
  /** Records discoveries across runs. Without one, nothing is recorded. */
  readonly codex?: Codex;
  /** Carried over from the previous level; a fresh start without it. */
  readonly kit?: Kit;
  /** What glyph chests can hold. */
  readonly chestLoot?: readonly MaterialKey[];
}

const MAX_MESSAGES = 6;
/** How often (ticks) to look around for new materials, creatures and glyphs. */
const DISCOVERY_SCAN_EVERY = 15;
/** Half-size of the area around the witch that counts as seen, in cells. */
const SEEN_HALF_W = 24;
const SEEN_HALF_H = 14;
const CREATURE_SEEN_RANGE = 20;
const DEFAULT_LOOT: readonly MaterialKey[] = ['water', 'sand', 'fire', 'oil'];

/** One level in play: the world, the witch, her pouch and wand, creatures, spells in flight, and the level's features. */
export class Game implements GameContext {
  tick = 0;
  readonly rng: Rng;
  readonly player: Player;
  readonly sim: Simulation;
  readonly grid: LevelLayout['grid'];
  readonly spawn: LevelLayout['spawn'];
  readonly pouch: Pouch;
  readonly harvester = new Harvester();
  /** Up to MAX_WANDS wands; keys 1-3 switch between them. */
  readonly wands: Wand[];
  activeWand = 0;
  readonly caster = new Caster();
  readonly carriers = new Carriers();
  readonly effects = new Effects();
  readonly creatures: Creature[] = [];
  readonly features: Features;
  /** Delivery and modifier glyphs known (matter glyphs are owned via the pouch). */
  readonly known: Set<string>;
  readonly stats: RunStats;
  /** Recent messages for the HUD, newest last. */
  readonly messages: GameMessage[] = [];
  /** Recent discoveries and unlocks, newest last. */
  readonly discoveries: Discovery[] = [];
  readonly codex: Codex | null;
  private nextCreatureId = 1;

  constructor(
    layout: LevelLayout,
    readonly seed: number,
    opts: GameOptions = {},
  ) {
    this.grid = layout.grid;
    this.spawn = layout.spawn;
    this.rng = new Rng(seed);
    // The world gets its own stream so player/creature randomness never perturbs the chemistry.
    this.sim = new Simulation(layout.grid, this.rng.fork(1).nextU32());
    this.player = new Player(layout.spawn.x + 0.5, layout.spawn.y + 0.5);
    const kit = opts.kit;
    this.pouch = kit?.pouch ?? new Pouch();
    this.pouch.inFlight.fill(0);
    this.wands = kit ? [...kit.wands] : [new Wand()];
    this.activeWand = Math.min(kit?.activeWand ?? 0, this.wands.length - 1);
    for (const w of this.wands) {
      w.queue.length = 0;
      w.recharge = 0;
    }
    this.known = new Set(kit?.known ?? STARTING_GLYPHS);
    this.stats = kit?.stats ?? new RunStats();
    if (kit) this.player.hp = Math.max(1, Math.min(this.player.maxHp, kit.hp));
    this.codex = opts.codex ?? null;
    if (this.codex) this.sim.onReaction = (i) => this.discover('reaction', REACTIONS[i]!.id);
    this.features = new Features(layout.exit, layout.chests, layout.vents, opts.chestLoot ?? DEFAULT_LOOT);
    for (const c of layout.creatures) this.spawnCreature(c.key, c.x + 0.5, c.y + 0.5);
  }

  static fromAscii(text: string, seed: number, opts: GameOptions = {}): Game {
    return new Game(loadAsciiLevel(text, seed), seed, opts);
  }

  /** What carries over to the next level. */
  kit(): Kit {
    this.recordReactions();
    return { hp: this.player.hp, pouch: this.pouch, wands: this.wands, activeWand: this.activeWand, known: this.known, stats: this.stats };
  }

  /**
   * Can this glyph go in a spell? Digits always; delivery and modifier glyphs
   * once known (and implemented); matter glyphs once harvested at least once.
   */
  readonly owns = (ch: string): boolean => {
    if (ch >= '0' && ch <= '9') return true;
    const m = MATERIAL_BY_GLYPH.get(ch);
    if (m !== undefined && m !== 0) return (this.pouch.seen[m] ?? 0) > 0;
    return this.known.has(ch) && (SPELL_GLYPH_BY_CHAR.get(ch)?.available ?? false);
  };

  say(text: string, kind: MessageKind = 'info'): void {
    this.messages.push({ text, kind, tick: this.tick });
    if (this.messages.length > MAX_MESSAGES) this.messages.shift();
  }

  /** Add a creature centered at (x, y) in cell units. */
  spawnCreature(key: CreatureKey, x: number, y: number, generation = 0): Creature {
    const c = new Creature(this.nextCreatureId++, key, x, y, generation);
    this.creatures.push(c);
    return c;
  }

  noteOwnBurst(x: number, y: number, payload: readonly number[]): void {
    const p = this.player;
    if (Math.hypot(p.x - x, p.y - y) > TUNING.ownBurstRadius) return;
    const fire = payload.includes(MAT.fire);
    if (fire) p.ownFire = TUNING.ownBurstTicks;
    if (payload.includes(MAT.steam) || (fire && payload.includes(MAT.water))) p.ownSteam = TUNING.ownBurstTicks;
  }

  /** Fold this level's reactions into the run's record. */
  recordReactions(): void {
    REACTIONS.forEach((r, i) => {
      if ((this.sim.reactionCounts[i] ?? 0) > 0) this.stats.reactions.add(r.id);
    });
  }

  /** Record a discovery in the Codex; new ones (and any unlocks they earn) get a banner. */
  discover(kind: DiscoveryKind, id: string): void {
    const unlocks = this.codex?.discover(kind, id);
    if (!unlocks) return;
    this.discoveries.push({ title: 'DISCOVERED', text: entryText(kind, id), tick: this.tick });
    for (const u of unlocks) this.discoveries.push({ title: 'UNLOCKED', text: `${u.title}: ${u.text}`, tick: this.tick });
    if (this.discoveries.length > 8) this.discoveries.splice(0, this.discoveries.length - 8);
  }

  /** Look around: materials near the witch, creatures in sight range, glyphs she owns. */
  private scanDiscoveries(): void {
    const codex = this.codex;
    if (!codex) return;
    const p = this.player;
    const g = this.grid;
    const seen = new Uint8Array(MAX_MATERIALS);
    const x0 = Math.max(0, Math.floor(p.x) - SEEN_HALF_W);
    const x1 = Math.min(g.width - 1, Math.floor(p.x) + SEEN_HALF_W);
    const y0 = Math.max(0, Math.floor(p.y) - SEEN_HALF_H);
    const y1 = Math.min(g.height - 1, Math.floor(p.y) + SEEN_HALF_H);
    for (let y = y0; y <= y1; y++) {
      const row = y * g.width;
      for (let x = x0; x <= x1; x++) {
        const m = g.mat[row + x] as number;
        if (m > 0 && m < MAX_MATERIALS) seen[m] = 1;
      }
    }
    for (const m of MATERIALS) if (m.id !== 0 && (seen[m.id] || this.pouch.seen[m.id])) this.discover('material', m.key);
    for (const c of this.creatures) {
      if (!c.dead && Math.hypot(c.x - p.x, c.y - p.y) <= CREATURE_SEEN_RANGE) this.discover('creature', c.def.key);
    }
    for (const glyph of CODEX_ENTRIES.glyph) if (this.owns(glyph)) this.discover('glyph', glyph);
  }

  /** The wand in hand. */
  get wand(): Wand {
    return this.wands[this.activeWand]!;
  }

  castFrom(casts: readonly PlannedCast[], x: number, y: number, angle: number, spell: string | null): void {
    for (const c of casts) this.caster.fireCast(this, c, x, y, angle, spell ?? spellName(this.wand.spell.text), false);
  }

  /** The witch reached the exit portal. */
  get exitReached(): boolean {
    return this.features.exitReached;
  }

  /** Advance one fixed tick. `simulateWorld: false` freezes the materials (Lab pause) but not the player. */
  step(input: TickInput, simulateWorld = true): void {
    if (simulateWorld) this.sim.step();
    this.player.update(input, this.grid, this.sim);
    this.harvester.update(input, this.player, this.grid, this.sim, this.pouch, this.rng);
    if (input.wandSlot >= 0 && input.wandSlot < this.wands.length && input.wandSlot !== this.activeWand) {
      this.activeWand = input.wandSlot;
      this.say(`Wand ${input.wandSlot + 1}: ${this.wand.spell.text}`, 'info');
    }
    this.caster.update(this, this.wands, input);
    this.carriers.update(this);
    updateCreatures(this);
    this.features.update(this);
    applyExplosions(this);
    if (this.tick % DISCOVERY_SCAN_EVERY === 0) this.scanDiscoveries();
    this.effects.update();
    this.tick++;
  }
}
