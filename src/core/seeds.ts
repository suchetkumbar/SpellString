import { hashString } from './rng';

/** Run seeds are shown to players, so they stay short: 1 .. 999999. */
export const SEED_RANGE = 999_999;

/** Today's date as YYYY-MM-DD (UTC), so everyone gets the same daily run. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The daily seed for a date (UTC): the same for every player that day. */
export function dailySeed(date: Date): number {
  return (hashString(`spellstring-daily-${dayKey(date)}`) % SEED_RANGE) + 1;
}

/** A typed seed: a number is used as-is (wrapped into range); any other text is hashed. Null for blank. */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t.slice(-9));
    return n === 0 ? SEED_RANGE : ((n - 1) % SEED_RANGE) + 1;
  }
  return (hashString(t) % SEED_RANGE) + 1;
}

/** Each level of a run gets its own seed from the run seed and its depth. */
export function levelSeed(runSeed: number, depth: number): number {
  return hashString(`${runSeed}:${depth}`);
}
