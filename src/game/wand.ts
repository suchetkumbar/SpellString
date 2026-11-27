import { TUNING } from '../data/tuning';
import { compileSpell, type CompiledSpell } from './spell/compile';
import type { PlannedCast } from './spell/plan';

export interface WandStats {
  /** Glyph slots. */
  readonly slots: number;
  readonly maxMana: number;
  /** Mana per second. */
  readonly manaRegen: number;
  /** Ticks between the casts of one spell. */
  readonly castDelayTicks: number;
  /** Ticks after the last cast before the wand fires again. */
  readonly rechargeTicks: number;
}

export const STARTING_WAND: WandStats = {
  slots: TUNING.wandSlots,
  maxMana: TUNING.wandMaxMana,
  manaRegen: TUNING.wandManaRegen,
  castDelayTicks: TUNING.wandCastDelayTicks,
  rechargeTicks: TUNING.wandRechargeTicks,
};

/** A wand: stats, the spell written in it, its mana and its firing state. */
export class Wand {
  mana: number;
  /** The spell in the wand. Always valid: the editor only writes spells that compile. */
  spell: CompiledSpell;
  /** Casts of the current click still to fire. */
  readonly queue: PlannedCast[] = [];
  /** Ticks until the next queued cast fires. */
  delay = 0;
  /** Ticks until the wand can start a new spell. */
  recharge = 0;

  constructor(
    public stats: WandStats = STARTING_WAND,
    spell: string = TUNING.wandStartSpell,
  ) {
    this.mana = stats.maxMana;
    this.spell = compileSpell(spell, { slots: stats.slots });
  }

  /** Mid-spell or recharging. */
  get busy(): boolean {
    return this.queue.length > 0 || this.recharge > 0;
  }

  /** Compile `text` for this wand. Doesn't change the wand. */
  compile(text: string, owns: (ch: string) => boolean): CompiledSpell {
    return compileSpell(text, { owns, slots: this.stats.slots });
  }

  /** Write a spell into the wand if it compiles. Returns the compiled spell either way. */
  write(text: string, owns: (ch: string) => boolean): CompiledSpell {
    const c = this.compile(text, owns);
    if (c.ok) this.spell = c;
    return c;
  }
}
