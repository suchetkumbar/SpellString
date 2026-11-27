import type { KeyValueStore } from '../core/storage';
import { MAX_MATERIALS } from '../core/materialTable';
import type { Kit } from './game';
import { Pouch } from './harvest';
import { RunStats } from './stats';
import { Wand, type WandStats } from './wand';
import type { RunMode } from './run';

/** Where a saved run lives. Bump the version if the format changes. */
export const RUN_SAVE_KEY = 'spellstring.run.v1';

/**
 * A run saved between levels: everything needed to rebuild the next level
 * (levels regenerate from the seed, so no map is stored) and the kit the
 * witch carries into it.
 */
export interface RunSave {
  readonly v: 1;
  readonly seed: number;
  readonly mode: RunMode;
  readonly label: string;
  /** The level to start on. */
  readonly depth: number;
  readonly hp: number;
  readonly pouch: { readonly counts: number[]; readonly seen: number[] };
  readonly wands: { readonly stats: WandStats; readonly spell: string; readonly mana: number }[];
  readonly activeWand: number;
  readonly known: string[];
  readonly stats: { readonly casts: [string, number][]; readonly kills: [string, number][]; readonly reactions: string[]; readonly creaturesKilled: number; readonly chestsOpened: number };
}

/** Turn a kit (plus where the run is) into a plain, JSON-safe save. */
export function serializeKit(kit: Kit, run: { seed: number; mode: RunMode; label: string }, depth: number): RunSave {
  return {
    v: 1,
    seed: run.seed,
    mode: run.mode,
    label: run.label,
    depth,
    hp: kit.hp,
    pouch: { counts: Array.from(kit.pouch.counts), seen: Array.from(kit.pouch.seen) },
    wands: kit.wands.map((w) => ({ stats: { ...w.stats }, spell: w.spell.text, mana: w.mana })),
    activeWand: kit.activeWand,
    known: [...kit.known],
    stats: {
      casts: [...kit.stats.casts],
      kills: [...kit.stats.kills],
      reactions: [...kit.stats.reactions],
      creaturesKilled: kit.stats.creaturesKilled,
      chestsOpened: kit.stats.chestsOpened,
    },
  };
}

/** Rebuild the kit from a save. */
export function kitFromSave(s: RunSave): Kit {
  const pouch = new Pouch();
  for (let m = 0; m < MAX_MATERIALS; m++) {
    pouch.counts[m] = s.pouch.counts[m] ?? 0;
    pouch.seen[m] = s.pouch.seen[m] ?? 0;
  }
  const wands = s.wands.map((w) => {
    const wand = new Wand({ ...w.stats }, w.spell);
    wand.mana = w.mana;
    return wand;
  });
  const stats = new RunStats();
  for (const [k, v] of s.stats.casts) stats.casts.set(k, v);
  for (const [k, v] of s.stats.kills) stats.kills.set(k, v);
  for (const r of s.stats.reactions) stats.reactions.add(r);
  stats.creaturesKilled = s.stats.creaturesKilled;
  stats.chestsOpened = s.stats.chestsOpened;
  return { hp: s.hp, pouch, wands: wands.length ? wands : [new Wand()], activeWand: s.activeWand, known: new Set(s.known), stats };
}

export function writeRunSave(store: KeyValueStore, save: RunSave): void {
  store.set(RUN_SAVE_KEY, JSON.stringify(save));
}

/** The saved run, or null if there's none (or it's unreadable). */
export function readRunSave(store: KeyValueStore): RunSave | null {
  const text = store.get(RUN_SAVE_KEY);
  if (!text) return null;
  try {
    const s = JSON.parse(text) as RunSave;
    if (s.v !== 1 || typeof s.seed !== 'number' || typeof s.depth !== 'number' || !Array.isArray(s.wands)) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearRunSave(store: KeyValueStore): void {
  store.remove(RUN_SAVE_KEY);
}
