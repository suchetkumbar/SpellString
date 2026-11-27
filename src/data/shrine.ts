import type { WandStats } from '../game/wand';

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

/** New wands a shrine can offer (while you hold fewer than MAX_WANDS). They start with the spell >. */
export interface WandTemplateDef {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly stats: WandStats;
}

export const WAND_TEMPLATES: readonly WandTemplateDef[] = [
  { id: 'quick', title: 'Quick wand', text: '3 slots, recharges in a blink.', stats: { slots: 3, maxMana: 80, manaRegen: 24, castDelayTicks: 3, rechargeTicks: 7 } },
  { id: 'deep', title: 'Deep wand', text: '6 slots and a deep mana pool, slow to recharge.', stats: { slots: 6, maxMana: 160, manaRegen: 16, castDelayTicks: 6, rechargeTicks: 32 } },
  { id: 'twin', title: 'Twin wand', text: 'A second 4-slot wand: another spell at hand.', stats: { slots: 4, maxMana: 100, manaRegen: 20, castDelayTicks: 5, rechargeTicks: 18 } },
];

/** Most wands the witch can carry (keys 1-3). */
export const MAX_WANDS = 3;

/** Most slots a wand can have. */
export const MAX_WAND_SLOTS = 9;
