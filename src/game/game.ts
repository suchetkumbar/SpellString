import { Rng } from '../core/rng';
import type { Grid } from '../core/grid';
import { loadAsciiLevel } from '../core/level';
import { Simulation } from '../core/sim';
import { MATERIAL_BY_GLYPH } from '../data/materials';
import { SPELL_GLYPH_BY_CHAR, STARTING_GLYPHS } from '../data/spellGlyphs';
import { Caster, type CastContext, type MessageKind } from './casting';
import { Harvester, Pouch } from './harvest';
import type { TickInput } from './input';
import { Player } from './player';
import { Wand } from './wand';

export type { TickInput } from './input';
export { NO_INPUT, tickInput } from './input';

export interface GameMessage {
  readonly text: string;
  readonly kind: MessageKind;
  readonly tick: number;
}

const MAX_MESSAGES = 6;

/** One level in play: the world, the witch, her pouch, wand and spells. */
export class Game implements CastContext {
  tick = 0;
  readonly rng: Rng;
  readonly player: Player;
  readonly sim: Simulation;
  readonly pouch = new Pouch();
  readonly harvester = new Harvester();
  readonly wand = new Wand();
  readonly caster = new Caster();
  /** Delivery and modifier glyphs known (matter glyphs are owned via the pouch). */
  readonly known = new Set<string>(STARTING_GLYPHS);
  /** Recent messages for the HUD, newest last. */
  readonly messages: GameMessage[] = [];

  constructor(
    readonly grid: Grid,
    readonly spawn: { readonly x: number; readonly y: number },
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    // The world gets its own stream so player/creature randomness never perturbs the chemistry.
    this.sim = new Simulation(grid, this.rng.fork(1).nextU32());
    this.player = new Player(spawn.x + 0.5, spawn.y + 0.5);
  }

  static fromAscii(text: string, seed: number): Game {
    const { grid, spawn } = loadAsciiLevel(text, seed);
    return new Game(grid, spawn, seed);
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

  /** Advance one fixed tick. `simulateWorld: false` freezes the materials (Lab pause) but not the player. */
  step(input: TickInput, simulateWorld = true): void {
    if (simulateWorld) this.sim.step();
    this.player.update(input, this.grid, this.sim);
    this.harvester.update(input, this.player, this.grid, this.sim, this.pouch, this.rng);
    this.caster.update(this, input);
    this.tick++;
  }
}
