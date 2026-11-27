/** Wand upgrades a Glyph Shrine can offer. Glyph offers come from SPELL_GLYPHS (any available glyph not yet known). */
export interface WandUpgradeDef {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** Added to the stat. */
  readonly slots?: number;
  readonly maxMana?: number;
  /** Multiplied into the stat. */
  readonly manaRegen?: number;
  readonly rechargeTicks?: number;
}

export const WAND_UPGRADES: readonly WandUpgradeDef[] = [
  { id: 'slot', title: '+1 slot', text: 'Room for one more glyph.', slots: 1 },
  { id: 'mana', title: '+30 max MP', text: 'A deeper well of mana.', maxMana: 30 },
  { id: 'regen', title: 'Mana regen ×1.4', text: 'Mana flows back faster.', manaRegen: 1.4 },
  { id: 'recharge', title: 'Recharge ×0.65', text: 'Fire again sooner.', rechargeTicks: 0.65 },
];

/** Most slots a wand can have. */
export const MAX_WAND_SLOTS = 9;
