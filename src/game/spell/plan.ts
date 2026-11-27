import { TUNING } from '../../data/tuning';
import type { CastNode, Delivery, Group } from './parse';

/** Payload placeholder for `?`, resolved to a real material when the cast fires. */
export const CHAOS = -1;

/** One cast in the plan: a delivery, how many carriers, and what each carries. */
export interface PlannedCast {
  readonly delivery: Delivery;
  /** 1 + 2 per `+`, after caps. */
  readonly carriers: number;
  /** Material ids, digits expanded (`~3` is three water). CHAOS for `?`. Empty = kinetic shot. */
  readonly payload: readonly number[];
  /** Casts fired from each carrier's impact point (`!`). Empty if none. */
  readonly trigger: readonly PlannedCast[];
}

export type CutReason = 'carriers' | 'cells' | 'depth';

export interface CastPlan {
  /** Top-level casts in firing order, loops expanded. */
  readonly casts: readonly PlannedCast[];
  /** Mana for everything that will fire. */
  readonly manaCost: number;
  /** Carriers and cells per click, triggers included. */
  readonly carriers: number;
  readonly cells: number;
  /** Why the spell was cut short, or null. */
  readonly cutOff: CutReason | null;
}

export interface PlanLimits {
  readonly carriers: number;
  readonly cells: number;
  readonly triggerDepth: number;
  readonly cellsPerGlyph: number;
}

export const DEFAULT_LIMITS: PlanLimits = {
  carriers: TUNING.maxCarriersPerClick,
  cells: TUNING.maxCellsPerClick,
  triggerDepth: TUNING.maxTriggerDepth,
  cellsPerGlyph: TUNING.burstCellsPerGlyph,
};

export function cutOffMessage(reason: CutReason, limits: PlanLimits = DEFAULT_LIMITS): string {
  switch (reason) {
    case 'carriers':
      return `Spell cut off: at most ${limits.carriers} carriers per click.`;
    case 'cells':
      return `Spell cut off: at most ${limits.cells} cells per click.`;
    case 'depth':
      return `Spell cut off: triggers nest at most ${limits.triggerDepth} deep.`;
  }
}

/**
 * The interpreter: turn a parsed spell into a cast plan. Expansion stops the
 * moment a cap is reached, so even `[[[[>]9]9]9]9` costs a bounded amount of work.
 */
export function buildPlan(groups: readonly Group[], limits: PlanLimits = DEFAULT_LIMITS): CastPlan {
  const cost = TUNING.spellCost;
  let carriers = 0;
  let cells = 0;
  let mana = 0;
  let cutOff: CutReason | null = null;

  const expandGroups = (gs: readonly Group[], depth: number): PlannedCast[] => {
    const out: PlannedCast[] = [];
    for (const g of gs) {
      if (cutOff) break;
      if (g.kind === 'cast') {
        const c = expandCast(g, depth);
        if (c) out.push(c);
      } else {
        mana += cost.loop;
        for (let k = 0; k < g.count && !cutOff; k++) out.push(...expandGroups(g.body, depth));
      }
    }
    return out;
  };

  const expandCast = (node: CastNode, depth: number): PlannedCast | null => {
    let payload: number[] = [];
    for (const item of node.payload) {
      if (item.kind === 'chaos') payload.push(CHAOS);
      else for (let k = 0; k < item.count; k++) payload.push(item.material);
    }

    let n = 1 + 2 * node.split;
    const roomCarriers = limits.carriers - carriers;
    if (roomCarriers <= 0) {
      cutOff = 'carriers';
      return null;
    }
    if (n > roomCarriers) {
      n = roomCarriers;
      cutOff = 'carriers';
    }
    const perCarrier = payload.length * limits.cellsPerGlyph;
    if (perCarrier > 0 && cells + n * perCarrier > limits.cells) {
      cutOff = 'cells';
      const fit = Math.floor((limits.cells - cells) / perCarrier);
      if (fit >= 1) {
        n = fit;
      } else {
        const glyphs = Math.floor((limits.cells - cells) / limits.cellsPerGlyph);
        if (glyphs <= 0) return null;
        payload = payload.slice(0, glyphs);
        n = 1;
      }
    }
    carriers += n;
    cells += n * payload.length * limits.cellsPerGlyph;
    mana += cost.delivery + node.split * cost.split;
    for (const m of payload) mana += m === CHAOS ? cost.chaos : cost.matter;

    let trigger: PlannedCast[] = [];
    if (node.trigger && !cutOff) {
      mana += cost.trigger;
      if (depth + 1 > limits.triggerDepth) {
        cutOff = 'depth';
      } else {
        // Every carrier triggers, so each one counts toward the caps; mana is paid once per glyph.
        let manaOnce = mana;
        for (let k = 0; k < n && !cutOff; k++) {
          const t = expandGroups(node.trigger, depth + 1);
          if (k === 0) {
            trigger = t;
            manaOnce = mana;
          }
        }
        mana = manaOnce;
      }
    }
    return { delivery: node.delivery, carriers: n, payload, trigger };
  };

  const casts = expandGroups(groups, 0);
  return { casts, manaCost: mana, carriers, cells, cutOff };
}

/** Charges a plan will try to spend, per material (CHAOS excluded). Triggers count once per carrier. */
export function chargesNeeded(plan: CastPlan): Map<number, number> {
  const need = new Map<number, number>();
  const visit = (casts: readonly PlannedCast[], mult: number): void => {
    for (const c of casts) {
      const k = mult * c.carriers;
      for (const m of c.payload) if (m !== CHAOS) need.set(m, (need.get(m) ?? 0) + k);
      visit(c.trigger, k);
    }
  };
  visit(plan.casts, 1);
  return need;
}
